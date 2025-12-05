import Order from "../../model/orderSchema.js";
import user from "../../model/userSchema.js";
import product from "../../model/productSchema.js";


const getOrdersPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const search = req.query.search?.trim() || "";
    const statusFilter = req.query.status || "";

    let query = {};

    if (search) {
      const users = await user
        .find({
          name: { $regex: search, $options: "i" },
        })
        .select("_id");

      const userIds = users.map((u) => u._id);

      query.$or = [
        { orderId: { $regex: search, $options: "i" } },
        { userId: { $in: userIds } },
      ];
    }

    if (statusFilter) {
      query.orderStatus = statusFilter;
    }

    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / limit) || 1;

    const orders = await Order.find(query)
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const formattedOrders = orders.map((o) => ({
      _id: o._id,
      orderId: o.orderId,
      username: o.userId?.name || "Guest",
      date: o.createdAt,
      totalAmount: o.finalAmount || o.totalPrice || 0,
      paymentMethod: o.payment,
      status: o.orderStatus,
      returnRequested: o.orderStatus === "Return Requested",
    }));

    res.render("admin/ordersPage", {
      orders: formattedOrders,
      currentPage: page,
      totalPages,
      totalOrders,
      search,
      statusFilter,
    });
  } catch (error) {
    console.error("Error loading orders:", error);
    res.status(500).render("error", {
      message: "Failed to load orders",
      error: error.message,
    });
  }
};

const getDetailPage = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    const orderData = await Order.findById(id)
      .populate("userId", "name email phone")
      .populate("orderedItem.productId", "name price images category brand")
      .populate(
        "address",
        "name houseName locality city state pincode phone email"
      )
      .populate("couponId");

    if (!orderData) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    return res.render("admin/orderDetailPage", {
      order: orderData,
    });
  } catch (error) {
    console.error("Error loading order details:", error);
    res.status(500).render("error", {
      message: "Failed to load order details",
      error: error.message,
    });
  }
};

const getNextValidStatuses = (currentStatus, isItem = false) => {
  const statusFlow = ["Pending", "Processing", "Shipped", "Delivered"];
  const cancelStatus = "Cancelled";
  const returnStatus = "Returned";
  const returnRequested = "Return Requested";
  const returnApproved = "Return Approved";
  const returnRejected = "Return Rejected";

  if (
    [returnRequested, returnApproved, returnRejected].includes(currentStatus)
  ) {
    return [];
  }

  if (currentStatus === cancelStatus || currentStatus === returnStatus) {
    return [];
  }

  if (currentStatus === "Delivered") {
    return [];
  }

  const currentIndex = statusFlow.indexOf(currentStatus);

  const nextStatuses = [];

  if (currentIndex + 1 < statusFlow.length) {
    nextStatuses.push(statusFlow[currentIndex + 1]);
  }

  if (currentStatus !== "Delivered") {
    nextStatuses.push(cancelStatus);
  }

  return [...new Set(nextStatuses)];
};

const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!id || !status) {
      return res.status(400).json({
        success: false,
        message: "Order ID and status are required",
      });
    }

    const currentOrder = await Order.findById(id);
    if (!currentOrder) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (
      ["Return Requested", "Return Approved", "Return Rejected"].includes(
        currentOrder.orderStatus
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Cannot update order in return process",
      });
    }

    if (
      currentOrder.orderStatus === "Cancelled" ||
      currentOrder.orderStatus === "Returned"
    ) {
      return res.status(400).json({
        success: false,
        message: "Cannot update a cancelled or returned order",
      });
    }

    if (currentOrder.orderStatus === "Delivered" && status !== "Delivered") {
      return res.status(400).json({
        success: false,
        message: "Cannot update status of a delivered order",
      });
    }

    const validNextStatuses = getNextValidStatuses(currentOrder.orderStatus);

    if (!validNextStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status transition. Current: ${
          currentOrder.orderStatus
        }, Valid next: ${validNextStatuses.join(", ")}`,
      });
    }

    const statusFlow = ["Pending", "Processing", "Shipped", "Delivered"];
    if (status !== "Cancelled") {
      const currentIndex = statusFlow.indexOf(currentOrder.orderStatus);
      const newIndex = statusFlow.indexOf(status);

      if (newIndex !== currentIndex + 1) {
        return res.status(400).json({
          success: false,
          message: `Cannot skip steps. Must go from ${
            currentOrder.orderStatus
          } to ${statusFlow[currentIndex + 1] || "Delivered"}`,
        });
      }
    }

    const updateData = { orderStatus: status };
    if (status === "Delivered") {
      updateData.deliveredDate = new Date();
    }

    const updatedOrder = await Order.findByIdAndUpdate(id, updateData, {
      new: true,
    });

    if (status === "Cancelled") {
      for (const item of currentOrder.orderedItem) {
        await restoreStock(item);
      }

      await Order.findByIdAndUpdate(id, {
        $set: { "orderedItem.$[].status": "Cancelled" },
      });
    }

    res.json({
      success: true,
      message: "Order status updated successfully",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update order status",
      error: error.message,
    });
  }
};

const updateItemStatus = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { status } = req.body;

    if (!orderId || !itemId || !status) {
      return res.status(400).json({
        success: false,
        message: "Order ID, Item ID and status are required",
      });
    }

    const orderData = await Order.findById(orderId);
    if (!orderData) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (
      ["Return Requested", "Return Approved", "Return Rejected"].includes(
        orderData.orderStatus
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Cannot update items in return process",
      });
    }

    if (
      orderData.orderStatus === "Cancelled" ||
      orderData.orderStatus === "Returned"
    ) {
      return res.status(400).json({
        success: false,
        message: "Cannot update items in a cancelled or returned order",
      });
    }

    const item = orderData.orderedItem.find(
      (item) => item._id.toString() === itemId
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found in order",
      });
    }

    if (item.status === "Delivered" && status !== "Delivered") {
      return res.status(400).json({
        success: false,
        message: "Cannot update status of a delivered item",
      });
    }

    const currentItemStatus = item.status || orderData.orderStatus;
    const validNextStatuses = getNextValidStatuses(currentItemStatus, true);

    if (!validNextStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status transition. Current: ${currentItemStatus}, Valid next: ${validNextStatuses.join(
          ", "
        )}`,
      });
    }

    const statusFlow = ["Pending", "Processing", "Shipped", "Delivered"];
    if (status !== "Cancelled") {
      const currentIndex = statusFlow.indexOf(currentItemStatus);
      const newIndex = statusFlow.indexOf(status);

      if (newIndex !== currentIndex + 1) {
        return res.status(400).json({
          success: false,
          message: `Item can only move one step at a time. Current: ${currentItemStatus}, Next: ${
            statusFlow[currentIndex + 1] || "Delivered"
          }`,
        });
      }
    }

    const itemIndex = orderData.orderedItem.findIndex(
      (i) => i._id.toString() === itemId
    );

    orderData.orderedItem[itemIndex].status = status;

    if (status === "Delivered") {
      orderData.orderedItem[itemIndex].deliveredDate = new Date();
    }

    if (status === "Cancelled") {
      await restoreStock(orderData.orderedItem[itemIndex]);
    }

    await orderData.save();

    const allItemsStatus = orderData.orderedItem.map(
      (item) => item.status || orderData.orderStatus
    );

    const allDelivered = allItemsStatus.every((s) => s === "Delivered");
    const allShipped = allItemsStatus.every((s) => s === "Shipped");
    const allProcessing = allItemsStatus.every((s) => s === "Processing");
    const anyCancelled = allItemsStatus.some((s) => s === "Cancelled");

    let newOrderStatus = orderData.orderStatus;

    if (anyCancelled) {
      newOrderStatus = "Cancelled";
    } else if (allDelivered) {
      newOrderStatus = "Delivered";
    } else if (allShipped) {
      newOrderStatus = "Shipped";
    } else if (allProcessing) {
      newOrderStatus = "Processing";
    }

    if (newOrderStatus !== orderData.orderStatus) {
      orderData.orderStatus = newOrderStatus;
      if (newOrderStatus === "Delivered") {
        orderData.deliveredDate = new Date();
      }
      await orderData.save();
    }

    res.json({
      success: true,
      message: "Item status updated successfully",
      order: orderData,
    });
  } catch (error) {
    console.error("Error updating item status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update item status",
      error: error.message,
    });
  }
};



async function restoreStock(item) {
  try {
    const productDoc = await product.findById(item.productId);
    if (!productDoc) return;

    if (productDoc.VariantItem?.length > 0) {
      let variant = null;

      if (item.variantId) {
        variant = productDoc.VariantItem.find(
          (v) => v._id.toString() === item.variantId.toString()
        );
      }

      if (!variant) {
        variant = productDoc.VariantItem.find((v) => v.Ml === item.ml);
      }

      if (variant) {
        variant.Quantity += item.quantity;
      }
    } else {
      productDoc.stock += item.quantity;
    }

    await productDoc.save();
  } catch (err) {
    console.error("Stock restore failed:", err);
  }
}

const approveReturnRequest = async (req, res) => {
  try {
    const { orderId } = req.params;

    const orderDoc = await Order.findById(orderId);
    if (!orderDoc) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (orderDoc.orderStatus !== "Return Requested") {
      return res.status(400).json({
        success: false,
        message: "No pending return request found for this order",
      });
    }

    orderDoc.orderStatus = "Return Approved";
    orderDoc.paymentStatus = "Refund Approved";
    orderDoc.returnApprovalDate = new Date();

    orderDoc.orderedItem.forEach((item) => {
      item.status = "Return Approved";
      item.returnApprovalDate = new Date();
    });

    await orderDoc.save();

    res.json({
      success: true,
      message:
        "Return approved successfully. Order is ready for refund processing.",
      order: orderDoc,
    });
  } catch (error) {
    console.error("Approve return error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

const rejectReturnRequest = async (req, res) => {
  try {
    const { orderId } = req.params;

    const orderDoc = await Order.findById(orderId);
    if (!orderDoc) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (orderDoc.orderStatus !== "Return Requested") {
      return res.status(400).json({
        success: false,
        message: "No pending return request found for this order",
      });
    }

    orderDoc.orderStatus = "Delivered";
    orderDoc.paymentStatus = "Paid";
    orderDoc.returnRejectionDate = new Date();

    orderDoc.orderedItem.forEach((item) => {
      item.status = "Delivered";
    });

    await orderDoc.save();

    res.json({
      success: true,
      message: "Return request rejected. Order status reverted to Delivered.",
      order: orderDoc,
    });
  } catch (error) {
    console.error("Reject return error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

const processRefund = async (req, res) => {
  try {
    const { orderId } = req.params;

    const orderDoc = await Order.findById(orderId);
    if (!orderDoc) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (orderDoc.orderStatus !== "Return Approved") {
      return res.status(400).json({
        success: false,
        message:
          "Order must be in 'Return Approved' status before processing refund",
      });
    }

    orderDoc.orderStatus = "Returned";
    orderDoc.paymentStatus = "Refunded";
    orderDoc.refundDate = new Date();
    orderDoc.refundAmount = orderDoc.finalAmount;

    orderDoc.orderedItem.forEach((item) => {
      item.status = "Returned";
    });

    for (const item of orderDoc.orderedItem) {
      await restoreStock(item);
    }

    await orderDoc.save();

    res.json({
      success: true,
      message: "Refund processed successfully. Stock has been restored.",
      order: orderDoc,
    });
  } catch (error) {
    console.error("Process refund error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export default {
  getOrdersPage,
  getDetailPage,
  updateOrderStatus,
  updateItemStatus,
  approveReturnRequest,
  rejectReturnRequest,
  processRefund,
};
