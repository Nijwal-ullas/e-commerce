import Order from "../../model/orderSchema.js";
import user from "../../model/userSchema.js";
import product from "../../model/productSchema.js";

const FLOW_STATUSES = ["Pending", "Processing", "Shipped", "Delivered"];

// ─────────────────────────────────────────────
// LIST ORDERS
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// ORDER DETAIL PAGE
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// HELPER: VALID NEXT STATUSES FOR MAIN ORDER
// NO CANCEL OPTION - orders can only be cancelled by customers
// ─────────────────────────────────────────────
const getNextValidStatuses = (currentStatus) => {
  if (currentStatus === "Delivered" || currentStatus === "Cancelled") {
    return [];
  }

  const idx = FLOW_STATUSES.indexOf(currentStatus);
  const nextStatuses = [];

  if (idx !== -1 && idx + 1 < statusFlow.length) {
    nextStatuses.push(FLOW_STATUSES[idx + 1]);
  }

  // REMOVED: "Cancelled" option - admin cannot cancel orders

  return [...new Set(nextStatuses)];
};

// ─────────────────────────────────────────────
// HELPER: VALID NEXT STATUSES FOR ITEM
// NO CANCEL OPTION - items can only be cancelled by customers
// ─────────────────────────────────────────────
function getItemNextValidStatuses(currentItemStatus, orderStatus) {
  const hardFinal = ["Cancelled", "Returned", "Return Approved"];

  if (hardFinal.includes(currentItemStatus)) {
    return [];
  }

  if (currentItemStatus === "Delivered" && orderStatus === "Delivered") {
    return ["Return Requested"];
  }

  if (currentItemStatus === "Return Requested") {
    return ["Return Approved", "Delivered"];
  }

  if (currentItemStatus === "Return Approved") {
    return ["Returned", "Return Requested"];
  }

  const idx = FLOW_STATUSES.indexOf(currentItemStatus);
  const next = [];

  if (idx !== -1 && idx + 1 < FLOW_STATUSES.length) {
    next.push(FLOW_STATUSES[idx + 1]);
  }

  // REMOVED: "Cancelled" option - admin cannot cancel items

  return next;
}

// ─────────────────────────────────────────────
// HELPER: RECALCULATE ORDER STATUS FROM ITEMS
// ─────────────────────────────────────────────
function recalculateOrderStatus(orderDoc) {
  const items = orderDoc.orderedItem || [];

  const activeItems = items.filter(item => 
    !["Cancelled", "Returned", "Return Approved", "Return Requested"].includes(item.status)
  );

  if (activeItems.length === 0) {
    if (items.every(item => item.status === "Cancelled")) {
      orderDoc.orderStatus = "Cancelled";
    } else if (items.every(item => item.status === "Returned")) {
      orderDoc.orderStatus = "Delivered";
    } else {
      orderDoc.orderStatus = "Delivered";
    }
    return;
  }

  let minIdx = Infinity;
  activeItems.forEach((i) => {
    const status = i.status || "Pending";
    const idx = FLOW_STATUSES.indexOf(status);
    if (idx !== -1 && idx < minIdx) {
      minIdx = idx;
    }
  });

  if (minIdx !== Infinity) {
    orderDoc.orderStatus = FLOW_STATUSES[minIdx];
  }

  const allActiveDelivered = activeItems.every(item => item.status === "Delivered");
  if (allActiveDelivered && !orderDoc.deliveredDate) {
    orderDoc.deliveredDate = new Date();
  }
}

// ─────────────────────────────────────────────
// HELPER: RECALCULATE ORDER PAYMENT STATUS
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// HELPER: CALCULATE REFUND AMOUNT FOR ITEM
// ─────────────────────────────────────────────
function calculateItemRefundAmount(item, orderDoc) {
  const itemTotal = item.price * item.quantity;
  
  if (orderDoc.discount && orderDoc.totalPrice > 0) {
    const discountRatio = orderDoc.discount / orderDoc.totalPrice;
    const discountedAmount = itemTotal * discountRatio;
    return itemTotal - discountedAmount;
  }
  
  return itemTotal;
}

// ─────────────────────────────────────────────
// MAIN ORDER STATUS UPDATE (NO CANCEL OPTION)
// ─────────────────────────────────────────────
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

    // Block updates for cancelled or returned orders
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

    // REMOVED: Cancel validation - admin cannot cancel

    const validNext = getNextValidStatuses(currentStatus);
    if (!validNext.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status transition. Current: ${currentStatus}, Valid next: ${validNext.join(", ")}`,
      });
    }

    // Update all active items to the new status
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

// ─────────────────────────────────────────────
// ITEM STATUS UPDATE (NO CANCEL OPTION)
// ─────────────────────────────────────────────
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

    if (status === "Return Requested" && orderDoc.orderStatus !== "Delivered") {
      return res.status(400).json({
        success: false,
        message: "Cannot request return until entire order is delivered",
      });
    }

    // REMOVED: Cancel logic - admin cannot cancel items

    currentItem.status = status;

    if (status === "Delivered") {
      currentItem.paymentStatus = "Paid";
      if (!currentItem.deliveredDate) {
        currentItem.deliveredDate = new Date();
      }
    } else if (status === "Return Requested") {
      currentItem.paymentStatus = "Return Requested";
      currentItem.returnRequestDate = new Date();
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

// ─────────────────────────────────────────────
// APPROVE RETURN FOR SPECIFIC ITEM
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// REJECT RETURN FOR SPECIFIC ITEM
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// REFUND SPECIFIC ITEM
// ─────────────────────────────────────────────
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

    recalculateOrderPaymentStatus(orderDoc);

    await orderDoc.save();

    return res.json({
      success: true,
      message: "Refund processed and totals recalculated successfully",
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

// ─────────────────────────────────────────────
// STOCK RESTORE HELPER
// ─────────────────────────────────────────────
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