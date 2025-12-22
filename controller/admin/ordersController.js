import Order from "../../model/orderSchema.js";
import user from "../../model/userSchema.js";
import product from "../../model/productSchema.js";
import wallet from "../../model/walletSchema.js";

const FLOW_STATUSES = ["Pending", "Processing", "Shipped", "Delivered"];

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
      if (statusFilter === "Return Requested" || statusFilter === "Return Approved") {
        query["orderedItem.status"] = statusFilter;
      } else {
        query.orderStatus = statusFilter;
      }
    }

    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / limit) || 1;

    const orders = await Order.find(query)
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const formattedOrders = orders.map((o) => {
      const hasReturnRequested = o.orderedItem.some(item => item.status === "Return Requested");
      const hasReturnApproved = o.orderedItem.some(item => item.status === "Return Approved");
      const hasReturned = o.orderedItem.some(item => item.status === "Returned");
      
      return {
        _id: o._id,
        orderId: o.orderId,
        username: o.userId?.name || "Guest",
        date: o.createdAt,
        totalAmount: o.finalAmount || o.totalPrice || 0,
        paymentMethod: o.payment,
        status: o.orderStatus,
        hasReturnRequested,
        hasReturnApproved,
        hasReturned,
      };
    });

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
      );

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

const getNextValidStatuses = (currentStatus) => {
  if (currentStatus === "Delivered" || currentStatus === "Cancelled") {
    return [];
  }

  const idx = FLOW_STATUSES.indexOf(currentStatus);
  const nextStatuses = [];

  if (idx !== -1 && idx + 1 < FLOW_STATUSES.length) {
    nextStatuses.push(FLOW_STATUSES[idx + 1]);
  }

  return [...new Set(nextStatuses)];
};

function getItemNextValidStatuses(currentItemStatus, orderStatus) {
  const hardFinal = ["Cancelled", "Returned", "Return Approved"];

  if (hardFinal.includes(currentItemStatus)) {
    return [];
  }

  if (currentItemStatus === "Delivered" && orderStatus === "Delivered") {
    return [];
  }

  if (currentItemStatus === "Return Requested") {
    return ["Return Approved", "Delivered"];
  }

  if (currentItemStatus === "Return Approved") {
    return ["Returned"];
  }

  const idx = FLOW_STATUSES.indexOf(currentItemStatus);
  const next = [];

  if (idx !== -1 && idx + 1 < FLOW_STATUSES.length) {
    next.push(FLOW_STATUSES[idx + 1]);
  }

  return next;
}

function recalculateOrderStatus(orderDoc) {
  const items = orderDoc.orderedItem || [];

  const hasReturned = items.some(item => item.status === "Returned");
  const allReturnedOrCancelled =
    items.length > 0 &&
    items.every(item =>
      ["Returned", "Cancelled"].includes(item.status)
    );

  const allItemsReturned =
    items.length > 0 &&
    items.every(item => item.status === "Returned");

  const allItemsCancelled =
    items.length > 0 &&
    items.every(item => item.status === "Cancelled");

  const activeItems = items.filter(item =>
    !["Cancelled", "Returned", "Return Approved", "Return Requested"]
      .includes(item.status)
  );

  if (allItemsReturned) {
    orderDoc.orderStatus = "Returned";
    if (!orderDoc.returnedDate) {
      orderDoc.returnedDate = new Date();
    }
    return;
  }

  if (hasReturned && allReturnedOrCancelled) {
    orderDoc.orderStatus = "Returned";
    if (!orderDoc.returnedDate) {
      orderDoc.returnedDate = new Date();
    }
    return;
  }

  if (allItemsCancelled) {
    orderDoc.orderStatus = "Cancelled";
    return;
  }

  if (activeItems.length === 0) {
    orderDoc.orderStatus = "Delivered";
    return;
  }

  let minIdx = Infinity;
  activeItems.forEach(item => {
    const status = item.status || "Pending";
    const idx = FLOW_STATUSES.indexOf(status);
    if (idx !== -1 && idx < minIdx) {
      minIdx = idx;
    }
  });

  if (minIdx !== Infinity) {
    orderDoc.orderStatus = FLOW_STATUSES[minIdx];
  }

  const allActiveDelivered = activeItems.every(
    item => item.status === "Delivered"
  );

  if (allActiveDelivered && !orderDoc.deliveredDate) {
    orderDoc.deliveredDate = new Date();
  }
}


function recalculateOrderPaymentStatus(orderDoc) {
  const items = orderDoc.orderedItem || [];
  
  if (items.length === 0) {
    orderDoc.paymentStatus = "Pending";
    return;
  }

  const activeItems = items.filter(item => 
    !["Cancelled", "Returned"].includes(item.status)
  );

  if (activeItems.length === 0) {
    if (items.every(item => item.status === "Cancelled")) {
      orderDoc.paymentStatus = "Pending";
    } else if (items.every(item => item.status === "Returned")) {
      orderDoc.paymentStatus = "Refunded";
    } else {
      orderDoc.paymentStatus = "Paid";
    }
    return;
  }

  const allActiveDelivered = activeItems.every(item => 
    item.status === "Delivered" || 
    item.status === "Return Requested" || 
    item.status === "Return Approved"
  );

  if (allActiveDelivered) {
    orderDoc.paymentStatus = "Paid";
    return;
  }

  const hasRefundedItems = items.some(item => item.paymentStatus === "Refunded");
  const hasRefundApprovedItems = items.some(item => item.paymentStatus === "Refund Approved");
  const hasReturnRequestedItems = items.some(item => item.paymentStatus === "Return Requested");
  const hasFailedItems = items.some(item => item.paymentStatus === "Failed");
  const hasPendingItems = items.some(item => item.paymentStatus === "Pending");

  if (hasFailedItems) {
    orderDoc.paymentStatus = "Failed";
  } else if (hasRefundedItems && activeItems.length === 0) {
    orderDoc.paymentStatus = "Refunded";
  } else if (hasRefundApprovedItems) {
    orderDoc.paymentStatus = "Refund Approved";
  } else if (hasReturnRequestedItems) {
    orderDoc.paymentStatus = "Refund Processing";
  } else if (hasPendingItems) {
    orderDoc.paymentStatus = "Pending";
  } else {
    orderDoc.paymentStatus = "Paid";
  }
}

function calculateItemRefundAmount(item, orderDoc) {
  const itemTotal = item.price * item.quantity;
  
  if (orderDoc.discount && orderDoc.totalPrice > 0) {
    const discountRatio = orderDoc.discount / orderDoc.totalPrice;
    const discountedAmount = itemTotal * discountRatio;
    return itemTotal - discountedAmount;
  }
  
  return itemTotal;
}

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

    const currentStatus = currentOrder.orderStatus;

    if (["Cancelled", "Returned"].includes(currentStatus)) {
      return res.status(400).json({
        success: false,
        message: "Cannot update a cancelled or returned order",
      });
    }

    if (currentStatus === "Delivered" && status !== "Delivered") {
      return res.status(400).json({
        success: false,
        message: "Cannot update status of a delivered order",
      });
    }

    const validNext = getNextValidStatuses(currentStatus);
    if (!validNext.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status transition. Current: ${currentStatus}, Valid next: ${validNext.join(", ")}`,
      });
    }

    const finalItemStates = ["Cancelled", "Returned", "Return Approved"];

    for (const item of currentOrder.orderedItem) {
      const currentItemStatus = item.status || currentStatus;

      if (finalItemStates.includes(currentItemStatus)) continue;
      if (currentItemStatus === "Delivered" && status !== "Delivered") continue;

      item.status = status;

      if (status === "Delivered") {
        item.paymentStatus = "Paid";
        if (!item.deliveredDate) {
          item.deliveredDate = new Date();
        }
      }
    }

    currentOrder.orderStatus = status;
    if (status === "Delivered" && !currentOrder.deliveredDate) {
      currentOrder.deliveredDate = new Date();
    }

    recalculateOrderPaymentStatus(currentOrder);
    await currentOrder.save();

    res.json({
      success: true,
      message: "Order status updated successfully",
      order: currentOrder,
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
        message: "Order ID, Item ID, and status are required",
      });
    }

    if (status === "Return Requested") {
      return res.status(403).json({
        success: false,
        message: "Only customers can request returns. Please wait for customer to request return.",
      });
    }

    const orderDoc = await Order.findById(orderId);
    if (!orderDoc) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const itemIndex = orderDoc.orderedItem.findIndex(
      (item) => item._id.toString() === itemId
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Item not found in order",
      });
    }

    const currentItem = orderDoc.orderedItem[itemIndex];
    const currentStatus = currentItem.status || orderDoc.orderStatus;

    const validStatuses = getItemNextValidStatuses(currentStatus, orderDoc.orderStatus);
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid item status transition. Current: ${currentStatus}, Valid next: ${validStatuses.join(", ")}`,
      });
    }


    currentItem.status = status;

    if (status === "Delivered") {
      currentItem.paymentStatus = "Paid";
      if (!currentItem.deliveredDate) {
        currentItem.deliveredDate = new Date();
      }
    } else if (status === "Return Approved") {
      currentItem.paymentStatus = "Refund Approved";
      currentItem.returnApprovalDate = new Date();
      currentItem.refundAmount = calculateItemRefundAmount(currentItem, orderDoc);
    } else if (status === "Returned") {
      currentItem.paymentStatus = "Refunded";
      currentItem.returnedDate = new Date();
      currentItem.refundAmount = currentItem.refundAmount || calculateItemRefundAmount(currentItem, orderDoc);
      currentItem.refundDate = new Date();
      await restoreStock(currentItem);
    }

    recalculateOrderPaymentStatus(orderDoc);
    if (!["Return Requested", "Return Approved", "Returned"].includes(status)) {
      recalculateOrderStatus(orderDoc);
    }

    await orderDoc.save();

    res.json({
      success: true,
      message: "Item status updated successfully",
      item: orderDoc.orderedItem[itemIndex],
      orderStatus: orderDoc.orderStatus,
      paymentStatus: orderDoc.paymentStatus,
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

const approveItemReturn = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;

    const orderDoc = await Order.findById(orderId);
    if (!orderDoc) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const item = orderDoc.orderedItem.id(itemId);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found in order",
      });
    }

    if (item.status !== "Return Requested") {
      return res.status(400).json({
        success: false,
        message: "Item does not have a pending return request",
      });
    }

    item.status = "Return Approved";
    item.paymentStatus = "Refund Approved";
    item.returnApprovalDate = new Date();
    item.refundAmount = calculateItemRefundAmount(item, orderDoc);

    recalculateOrderPaymentStatus(orderDoc);
    recalculateOrderStatus(orderDoc);

    await orderDoc.save();

    res.json({
      success: true,
      message: "Item return approved successfully",
      item: item,
      orderStatus: orderDoc.orderStatus,
    });
  } catch (error) {
    console.error("Approve item return error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to approve item return",
    });
  }
};

const rejectItemReturn = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;

    const orderDoc = await Order.findById(orderId);
    if (!orderDoc) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const item = orderDoc.orderedItem.id(itemId);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found in order",
      });
    }

    if (item.status !== "Return Requested") {
      return res.status(400).json({
        success: false,
        message: "Item does not have a pending return request",
      });
    }

    item.status = "Delivered";
    item.paymentStatus = "Paid";
    item.returnRejectionDate = new Date();

    recalculateOrderPaymentStatus(orderDoc);

    await orderDoc.save();

    res.json({
      success: true,
      message: "Item return rejected successfully",
      item: item,
      orderStatus: orderDoc.orderStatus,
    });
  } catch (error) {
    console.error("Reject item return error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to reject item return",
    });
  }
};

const refundItem = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;

    const orderDoc = await Order.findById(orderId);
    if (!orderDoc) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const item = orderDoc.orderedItem.id(itemId);
    if (!item) {
      return res.status(404).json({ success: false, message: "Item not found" });
    }

    if (item.status !== "Return Approved") {
      return res.status(400).json({
        success: false,
        message: "Item must be approved for refund",
      });
    }

    item.status = "Returned";
    item.paymentStatus = "Refunded";
    item.returnedDate = new Date();
    item.refundAmount = item.price * item.quantity; 
    item.refundDate = new Date();

    await restoreStock(item);

    if (orderDoc.walletUsed > 0) {
      const itemValue = item.price * item.quantity;
      const refundAmount = Math.min(itemValue, orderDoc.walletUsed);

      if (refundAmount > 0) {
        await refundToWallet(orderDoc.userId, refundAmount);
        orderDoc.walletUsed -= refundAmount; 
      }
    }

    let newTotalPrice = 0;
    let newFinalTotal = 0;

    for (const itm of orderDoc.orderedItem) {
      if (itm.status === "Returned" || itm.status === "Cancelled") continue;

      const productDoc = await product.findById(itm.productId);
      if (!productDoc) continue;

      let variantDoc = null;

      if (itm.variantId) {
        variantDoc = productDoc.VariantItem.find(
          (v) => v._id.toString() === itm.variantId.toString()
        );
      }

      if (!variantDoc && itm.ml) {
        variantDoc = productDoc.VariantItem.find(
          (v) => v.Ml === Number(itm.ml)
        );
      }

      if (!variantDoc) continue;

      const basePrice = variantDoc.Price;
      const offerPrice = variantDoc.offerPrice || variantDoc.Price;

      newTotalPrice += basePrice * itm.quantity;
      newFinalTotal += offerPrice * itm.quantity;
    }

    const newDiscount = newTotalPrice - newFinalTotal;

    orderDoc.totalPrice = newTotalPrice;
    orderDoc.discount = Math.max(newDiscount, 0);
    orderDoc.finalAmount = Math.max(newFinalTotal, 0);

    recalculateOrderStatus(orderDoc); 
    recalculateOrderPaymentStatus(orderDoc);

    await orderDoc.save();

    return res.json({
      success: true,
      message: "Refund processed successfully and amount added back to wallet",
      order: orderDoc,
    });

  } catch (error) {
    console.error("Refund Item Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process refund",
    });
  }
};

async function refundToWallet(userId, amount) {
  if (!amount || amount <= 0) return;

  let userWallet = await wallet.findOne({ UserId: userId });

  if (!userWallet) {
    userWallet = new wallet({
      UserId: userId,
      Balance: "0",
      Wallet_transaction: []
    });
  }

  const currentBalance = parseFloat(userWallet.Balance) || 0;
  const newBalance = currentBalance + amount;

  userWallet.Balance = newBalance.toString();

  userWallet.Wallet_transaction.push({
    Amount: amount.toString(),
    Type: "credit",
    CreatedAt: new Date(),
    Description: "Refund for returned item"
  });

  await userWallet.save();
}

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

      if (!variant && typeof item.ml === "number") {
        variant = productDoc.VariantItem.find((v) => v.Ml === item.ml);
      }

      if (variant) {
        variant.Quantity += item.quantity;
      }
    } else if (typeof productDoc.stock === "number") {
      productDoc.stock += item.quantity;
    }

    await productDoc.save();
  } catch (err) {
    console.error("Stock restore failed:", err);
  }
}

export default {
  getOrdersPage,
  getDetailPage,
  updateOrderStatus,
  updateItemStatus,
  approveItemReturn,
  rejectItemReturn,
  refundItem,
};