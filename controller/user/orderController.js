import user from "../../model/userSchema.js";
import Order from "../../model/orderSchema.js";
import product from "../../model/productSchema.js";
import wallet from "../../model/walletSchema.js";
import Coupons from "../../model/couponSchema.js";  
import PDFDocument from "pdfkit";

const getOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect("/login");

    const userData = await user.findById(userId);

    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const orderData = await Order.find({ userId })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean();

    const totalOrders = await Order.countDocuments({ userId });
    const totalPages = Math.ceil(totalOrders / limit);

    const allOrders = await Order.find({ userId }, "orderedItem finalAmount totalPrice");
    const totalItems = allOrders.reduce(
      (sum, order) => sum + (order.orderedItem?.length || 0),
      0
    );

    const totalRevenue = allOrders.reduce((sum, order) => {
      return sum + parseFloat(order.finalAmount || order.totalPrice || 0);
    }, 0);

    return res.render("user/orderPage", {
      user: userData,
      orders: orderData || [],
      page,
      totalPages,
      totalOrders,
      totalItems,
      totalRevenue
    });
  } catch (error) {
    console.log(error);
    return res.status(500).send("Server Error");
  }
};

const getOrderDetails = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect("/login");

    const { orderId } = req.params;

    if (!orderId) {
      return res.redirect("/orders?error=Order ID is required");
    }

    const orderDetails = await Order.findOne({
      _id: orderId,
      userId,
    })
      .populate({
        path: "orderedItem.productId",
        select: "productName images brand category description",
      })
      .lean();

    if (!orderDetails) {
      return res.status(400).json({
        success: false,
        message: " order not found"
      });
    }

    const userData = await user
      .findById(userId)
      .select("name email phone profileImage");

    if (!userData) {
      return res.status(400).json({
        success: false,
        message: " userData not found"
      });
    }

    if (orderDetails.orderedItem && orderDetails.orderedItem.length > 0) {
      orderDetails.orderedItem = orderDetails.orderedItem.map((item) => {
        if (item.productId) {
          if (typeof item.productId.images === "string") {
            item.productId.images = [item.productId.images];
          }
          if (item.productId.images && item.productId.images.length > 0) {
            item.productId.images = item.productId.images.map((img) => {
              if (img && !img.startsWith("http") && !img.startsWith("/")) {
                return "/" + img;
              }
              return img;
            });
          }
        }
        if (!item.status) {
          item.status = orderDetails.orderStatus || "Pending";
        }
        return item;
      });
    }

    let shippingAddress = {
      name: userData.name || "Customer",
      phone: userData.phone || "Not provided",
      alterPhone: "",
      flatNumber: "Not specified",
      streetName: "",
      landmark: "",
      city: "Not specified",
      state: "Not specified",
      pincode: "",
      country: "India",
      addressType: "home",
    };

    if (
      orderDetails.shippingAddress &&
      Array.isArray(orderDetails.shippingAddress) &&
      orderDetails.shippingAddress.length > 0
    ) {
      const shipAddr = orderDetails.shippingAddress[0];

      shippingAddress = {
        name: shipAddr.name || userData.name || "Customer",
        phone: shipAddr.phone || userData.phone || "Not provided",
        alterPhone: shipAddr.alterPhone || "",
        flatNumber: shipAddr.flatNumber || "Not specified",
        streetName: shipAddr.streetName || "",
        landmark: shipAddr.landmark || "",
        city: shipAddr.city || "Not specified",
        state: shipAddr.state || "Not specified",
        pincode: shipAddr.pincode ? String(shipAddr.pincode) : "",
        country: shipAddr.country || "India",
        addressType: shipAddr.addressType || "home",
      };
    }

    orderDetails.status = orderDetails.orderStatus || "Pending";
    orderDetails.paymentMethod = orderDetails.payment || "COD";
    orderDetails.deliveryCharge = (orderDetails.totalPrice - orderDetails.discount) >= 500 ? 0 : 50;
    orderDetails.couponApplied = orderDetails.couponId ? "Applied" : null;

    return res.render("user/orderDetailPage", {
      user: userData,
      order: orderDetails,
      shippingAddress: shippingAddress,
      pageTitle: `Order #${
        orderDetails.orderId ||
        orderDetails._id.toString().slice(-8).toUpperCase()
      }`,
    });
  } catch (error) {
    console.error("Error in getOrderDetails:", error);
    return res.status(500).send("Server Error");
  }
};

const cancelOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId)
      return res.status(401).json({ success: false, message: "Login first" });

    const { orderId } = req.params;
    const { itemId, reason, cancelAll } = req.body;

    const orderDoc = await Order.findOne({ _id: orderId, userId });
    if (!orderDoc)
      return res.status(404).json({ success: false, message: "Order not found" });

    const canCancelOrder = ["Pending", "Processing"].includes(orderDoc.orderStatus);
    if (!canCancelOrder)
      return res.status(400).json({
        success: false,
        message: `Cannot cancel order with status ${orderDoc.orderStatus}`,
      });

    if (cancelAll === "true" || cancelAll === true)
      return await cancelAllItems(orderDoc, userId, reason, res);

    return await cancelSingleItem(orderDoc, userId, itemId, reason, res);

  } catch (error) {
    console.error("Cancel error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

function getUpdatedOrderStatus(items) {
  if (items.length === 0) {
    return "Cancelled";
  }

  const allDelivered = items.every(item => item.status === "Delivered");
  if (allDelivered) {
    return "Delivered";
  }

  const allCancelled = items.every(item => item.status === "Cancelled");
  if (allCancelled) {
    return "Cancelled";
  }

  const hasShipped = items.some(item => item.status === "Shipped");
  const hasProcessing = items.some(item => item.status === "Processing");
  const hasPending = items.some(item => item.status === "Pending");
  const hasDelivered = items.some(item => item.status === "Delivered");
  const hasReturnRequested = items.some(item => item.status === "Return Requested");

  if (hasShipped) return "Shipped";
  if (hasProcessing) return "Processing";
  if (hasPending) return "Pending";
  if (hasReturnRequested) return "Return Requested";
  if (hasDelivered) return "Partially Delivered";

  const hasCancelled = items.some(item => item.status === "Cancelled");
  if (hasCancelled) {
    return "Partially Cancelled";
  }

  return "Processing"; 
}

async function cancelAllItems(orderDoc, userId, reason, res) {
  orderDoc.cancellationReason = reason || "";

  const couponCode = orderDoc.couponCode;
  const couponId = orderDoc.couponId;

  for (const item of orderDoc.orderedItem) {
    if (["Pending", "Processing", "Shipped"].includes(item.status)) {
      item.status = "Cancelled";
      item.paymentStatus = "Pending";
      item.cancellationReason = reason || "";
      await restoreStock(item);
    }
  }

  const cancelledItems = orderDoc.orderedItem.filter(i => i.status === "Cancelled");
  const deliveredItems = orderDoc.orderedItem.filter(i => i.status === "Delivered");

  let refundAmount = 0;
  
  if (orderDoc.payment !== "Cod" && cancelledItems.length > 0) {
    // refundAmount = cancelledItems.reduce(
    //   (sum, item) => sum + (item.price * item.quantity),
    //   0
    // );
    refundAmount = orderDoc.finalAmount;
    
    if (refundAmount > 0) {
      await refundToWallet(userId, refundAmount);
    }
  }

  if (deliveredItems.length === 0) {
    orderDoc.orderStatus = "Cancelled";
    orderDoc.totalPrice = 0;
    orderDoc.discount = 0;
    orderDoc.finalAmount = 0;
    orderDoc.walletUsed = 0;
    orderDoc.couponCode = null;
    orderDoc.couponId = null;
    orderDoc.couponDiscount = 0;
    orderDoc.couponUsed = false;

    await orderDoc.save();

    // Release coupon if applicable
    // if (couponCode && couponId) {
    //   await releaseCouponForUser(userId, orderDoc._id, couponId);
    // }

    return res.json({
      success: true,
      message: "Order fully cancelled",
      refundedToWallet: orderDoc.payment !== "Cod" ? refundAmount : 0,
      // couponReleased: !!couponCode,
      orderStatus: "Cancelled"
    });
  }

  const couponAdjusted = await adjustCouponAfterCancellation(orderDoc, couponId, deliveredItems);

  let newBaseTotal = 0;
  let newOfferTotal = 0;

  for (const item of deliveredItems) {
    const productDoc = await product.findById(item.productId);
    if (!productDoc) continue;

    let variant = null;
    if (item.variantId)
      variant = productDoc.VariantItem.find(v => v._id.toString() === item.variantId.toString());

    if (!variant && item.ml)
      variant = productDoc.VariantItem.find(v => v.Ml === item.ml);

    if (!variant) continue;

    const basePrice = variant.Price;
    const finalPrice = variant.offerPrice || variant.Price;

    newBaseTotal += basePrice * item.quantity;
    newOfferTotal += finalPrice * item.quantity;
  }

  orderDoc.totalPrice = newBaseTotal;
  orderDoc.discount = newBaseTotal - newOfferTotal;
  
  const afterDiscount = newOfferTotal - orderDoc.couponDiscount;
  const deliveryCharge = afterDiscount >= 500 ? 0 : 50;
  
  orderDoc.finalAmount = afterDiscount + deliveryCharge;

  orderDoc.orderStatus = getUpdatedOrderStatus(deliveredItems);

  await orderDoc.save();

  return res.json({
    success: true,
    message: "Order partially cancelled",
    refundedToWallet: orderDoc.payment !== "Cod" ? refundAmount : 0,
    couponAdjusted: couponAdjusted,
    orderStatus: orderDoc.orderStatus,
    remainingItems: deliveredItems.length
  });
}

async function cancelSingleItem(orderDoc, userId, itemId, reason, res) {
  const item = orderDoc.orderedItem.find(i => i._id.toString() === itemId);
  if (!item)
    return res.status(404).json({ success: false, message: "Item not found" });

  if (!["Pending", "Processing"].includes(item.status)) {
    return res.status(400).json({
      success: false,
      message: "Item cannot be cancelled now",
    });
  }

  item.status = "Cancelled";
  item.cancellationReason = reason || "";
  await restoreStock(item);

  const couponCode = orderDoc.couponCode;
  const couponId = orderDoc.couponId;

  const cancelledPrice = item.price * item.quantity;
  let refundAmount = 0;
  
  if (orderDoc.payment !== "Cod") {
    refundAmount = cancelledPrice;
    if (refundAmount > 0) {
      await refundToWallet(userId, refundAmount);
    }
  }

  const activeItems = orderDoc.orderedItem.filter(i => i.status !== "Cancelled");

  if (activeItems.length === 0) {
    orderDoc.orderStatus = "Cancelled";
    // orderDoc.couponCode = null;
    // orderDoc.couponId = null;
    // orderDoc.couponDiscount = 0;
    // orderDoc.couponUsed = false;
    orderDoc.totalPrice = 0;
    orderDoc.discount = 0;
    orderDoc.finalAmount = 0;

    await orderDoc.save();

    // Release coupon if applicable
    // if (couponCode && couponId) {
    //   await releaseCouponForUser(userId, orderDoc._id, couponId);
    // }

    return res.json({
      success: true,
      message: "Item cancelled and order closed",
      refundedToWallet: refundAmount,
      // couponReleased: !!couponCode,
      orderStatus: "Cancelled"
    });
  }

  const couponAdjusted = await adjustCouponAfterCancellation(orderDoc, couponId, activeItems);

  let newBase = 0;
  let newDiscount = 0;

  for (const activeItem of activeItems) {
    const productDoc = await product.findById(activeItem.productId);
    if (!productDoc) continue;

    let variant = null;
    if (activeItem.variantId)
      variant = productDoc.VariantItem.find(v => v._id.toString() === activeItem.variantId.toString());

    if (!variant && activeItem.ml)
      variant = productDoc.VariantItem.find(v => v.Ml === activeItem.ml);

    const basePrice = variant ? variant.Price : activeItem.price;
    const finalPrice = variant ? (variant.offerPrice || variant.Price) : activeItem.price;

    newBase += basePrice * activeItem.quantity;
    newDiscount += (basePrice - finalPrice) * activeItem.quantity;
  }

  const afterDiscount = newBase - newDiscount - orderDoc.couponDiscount;
  const delivery = afterDiscount >= 500 ? 0 : 50;

  orderDoc.totalPrice = newBase;
  orderDoc.discount = newDiscount;
  orderDoc.finalAmount = afterDiscount + delivery;
  
  orderDoc.orderStatus = getUpdatedOrderStatus(activeItems);

  await orderDoc.save();

  return res.json({
    success: true,
    message: "Item cancelled successfully",
    refundedToWallet: refundAmount,
    newFinalAmount: orderDoc.finalAmount,
    couponAdjusted: couponAdjusted,
    orderStatus: orderDoc.orderStatus,
    remainingItems: activeItems.length
  });
}

async function adjustCouponAfterCancellation(orderDoc, couponId, activeItems) {
  if (!orderDoc.couponCode || !couponId) return false;

  const coupon = await Coupons.findById(couponId);
  if (!coupon) return false;

  let remainingSubtotal = 0;

  for (const activeItem of activeItems) {
    const productDoc = await product.findById(activeItem.productId);
    if (!productDoc) continue;

    let variant = null;
    if (activeItem.variantId) {
      variant = productDoc.VariantItem.find(
        v => v._id.toString() === activeItem.variantId.toString()
      );
    }
    if (!variant && activeItem.ml) {
      variant = productDoc.VariantItem.find(v => v.Ml === activeItem.ml);
    }

    const basePrice = variant ? variant.Price : activeItem.price;
    remainingSubtotal += basePrice * activeItem.quantity;
  }

  if (remainingSubtotal < coupon.minCartValue) {
    orderDoc.couponCode = null;
    orderDoc.couponId = null;
    orderDoc.couponDiscount = 0;
    orderDoc.couponUsed = false;
    return true;
  }

  const originalSubtotal = orderDoc.totalPrice;
  if (originalSubtotal <= 0) {
    orderDoc.couponDiscount = 0;
    return true;
  }

  orderDoc.couponDiscount =
    Math.round((remainingSubtotal / originalSubtotal) * orderDoc.couponDiscount * 100) / 100;

  return true;
}

// async function releaseCouponForUser(userId, orderId, couponId) {
//   try {
//     await Coupons.findByIdAndUpdate(couponId, {
//       $pull: { 
//         usedBy: { 
//           userId: userId,
//           orderId: orderId
//         } 
//       },
//       $inc: { totalUsage: -1 }
//     });
//   } catch (error) {
//     console.error("Error releasing coupon:", error);
//   }
// }

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

  const balance = parseFloat(userWallet.Balance) || 0;
  userWallet.Balance = (balance + amount).toString();

  userWallet.Wallet_transaction.push({
    Amount: amount.toString(),
    Type: "credit",
    CreatedAt: new Date(),
    Description: "Refund for cancelled item"
  });

  await userWallet.save();
}

async function restoreStock(item) {
  try {
    const productDoc = await product.findById(item.productId);
    if (!productDoc) return;

    if (productDoc.VariantItem?.length > 0) {
      let variant = null;

      if (item.variantId)
        variant = productDoc.VariantItem.find(v => v._id.toString() === item.variantId.toString());

      if (!variant && item.ml)
        variant = productDoc.VariantItem.find(v => v.Ml === item.ml);

      if (variant) variant.Quantity += item.quantity;

    } else {
      productDoc.stock += item.quantity;
    }

    await productDoc.save();
  } catch (err) {
    console.error("Stock restore failed:", err);
  }
}

const downloadInvoice = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.user;

    if (!userId) return res.redirect("/login")

    const userData = await user.findById(userId);
    const orderDoc = await Order.findOne({ _id: orderId, userId }).populate(
      "orderedItem.productId"
    );

    if (!orderDoc) return res.status(400).json({
     success : false,
     message : "order does not exist"
     });

    const invoiceName = `Invoice_${orderDoc.orderId}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${invoiceName}"`
    );

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    doc.pipe(res);

    doc.fontSize(24).fillColor("#2563eb").text("INVOICE", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor("#6b7280").text("Tax Invoice", { align: "center" });
    doc.moveDown(1);

    const topY = doc.y;
    
    doc.fontSize(12).fillColor("#000000").text("Ruhe Collection", 50, topY);
    doc.fontSize(9).fillColor("#4b5563")
      .text("123 Business Street", 50)
      .text("City, State - 123456", 50)
      .text("Phone: +91 1234567890", 50)
      .text("Email: info@ruhecollection.com", 50);

    doc.fontSize(10).fillColor("#000000")
      .text(`Invoice No: ${orderDoc.orderId}`, 350, topY, { width: 200, align: "right" });
    doc.fontSize(9).fillColor("#4b5563")
      .text(`Date: ${new Date(orderDoc.createdAt).toLocaleDateString('en-IN')}`, 350, doc.y, { width: 200, align: "right" })
      .text(`Order Status: ${orderDoc.orderStatus}`, 350, doc.y, { width: 200, align: "right" })
      .text(`Payment: ${orderDoc.payment}`, 350, doc.y, { width: 200, align: "right" });

    doc.moveDown(2);

    doc.fontSize(11).fillColor("#000000").text("BILL TO:", 50);
    doc.fontSize(10).fillColor("#4b5563")
      .text(userData.name || "Customer", 50)
      .text(userData.email || "", 50)
      .text(userData.phone || "", 50);

    if (orderDoc.shippingAddress && orderDoc.shippingAddress.length > 0) {
      const addr = orderDoc.shippingAddress[0];
      doc.text(`${addr.flatNumber || ""} ${addr.streetName || ""}`, 50)
        .text(`${addr.city || ""}, ${addr.state || ""} - ${addr.pincode || ""}`, 50)
        .text(addr.phone || "", 50);
    }

    doc.moveDown(1.5);

    const tableTop = doc.y;
    const itemCol = 50;
    const qtyCol = 280;
    const priceCol = 340;
    const amountCol = 420;
    const lineHeight = 20;

    doc.rect(50, tableTop, 495, 25).fillAndStroke("#2563eb", "#2563eb");

    doc.fontSize(10).fillColor("#ffffff")
      .text("ITEM DESCRIPTION", itemCol + 5, tableTop + 8, { width: 220 })
      .text("QTY", qtyCol, tableTop + 8, { width: 50, align: "center" })
      .text("PRICE", priceCol, tableTop + 8, { width: 70, align: "right" })
      .text("AMOUNT", amountCol, tableTop + 8, { width: 115, align: "right" });

    let currentY = tableTop + 25;
    doc.fillColor("#000000");

    orderDoc.orderedItem.forEach((item, index) => {
      if (index % 2 === 1) {
        doc.rect(50, currentY, 495, lineHeight).fillAndStroke("#f3f4f6", "#e5e7eb");
      } else {
        doc.rect(50, currentY, 495, lineHeight).stroke("#e5e7eb");
      }

      const productName = item.productName;
      const variantInfo = item.ml;
      const oldPrice = item.oldPrice;

      doc.fontSize(9).fillColor("#000000")
        .text(`${productName}(${variantInfo}ml)`, itemCol + 5, currentY + 6, { width: 220 })
        .text(item.quantity.toString(), qtyCol, currentY + 6, { width: 50, align: "center" })
        .text(`${oldPrice.toFixed(2)}`, priceCol, currentY + 6, { width: 70, align: "right" })
        .text(`${(oldPrice * item.quantity).toFixed(2)}`, amountCol, currentY + 6, { width: 115, align: "right" });

      currentY += lineHeight;
    });

    currentY += 10;
    const summaryX = 350;
    const summaryLabelWidth = 100;
    const summaryValueWidth = 95;

    doc.fontSize(9).fillColor("#4b5563")
      .text("Subtotal:", summaryX, currentY, { width: summaryLabelWidth, align: "left" })
      .text(`${orderDoc.totalPrice.toFixed(2)}`, summaryX + summaryLabelWidth, currentY, { width: summaryValueWidth, align: "right" });
    currentY += 18;

    if (orderDoc.discount > 0) {
      doc.fillColor("#16a34a")
        .text("Product Discount:", summaryX, currentY, { width: summaryLabelWidth, align: "left" })
        .text(`-${orderDoc.discount.toFixed(2)}`, summaryX + summaryLabelWidth, currentY, { width: summaryValueWidth, align: "right" });
      currentY += 18;
    }

    if (orderDoc.couponDiscount > 0) {
      doc.fillColor("#16a34a")
        .text(`Coupon (${orderDoc.couponCode}):`, summaryX, currentY, { width: summaryLabelWidth, align: "left" })
        .text(`-${orderDoc.couponDiscount.toFixed(2)}`, summaryX + summaryLabelWidth, currentY, { width: summaryValueWidth, align: "right" });
      currentY += 18;
    }

    const shippingCharge = orderDoc.shippingCharge || 0;
    doc.fillColor("#4b5563")
      .text("Shipping:", summaryX, currentY, { width: summaryLabelWidth, align: "left" })
      .text(shippingCharge === 0 ? "FREE" : `${shippingCharge.toFixed(2)}`, summaryX + summaryLabelWidth, currentY, { width: summaryValueWidth, align: "right" });
    currentY += 18;

    if (orderDoc.walletUsed > 0) {
      doc.fillColor("#7c3aed")
        .text("Wallet Used:", summaryX, currentY, { width: summaryLabelWidth, align: "left" })
        .text(`-${orderDoc.walletUsed.toFixed(2)}`, summaryX + summaryLabelWidth, currentY, { width: summaryValueWidth, align: "right" });
      currentY += 18;
    }

    currentY += 5;
    doc.rect(summaryX - 5, currentY - 5, 205, 25).fillAndStroke("#2563eb", "#2563eb");
    
    doc.fontSize(11).fillColor("#ffffff")
      .text("TOTAL AMOUNT:", summaryX, currentY + 2, { width: summaryLabelWidth, align: "left" })
      .text(`${orderDoc.finalAmount.toFixed(2)}`, summaryX + summaryLabelWidth, currentY + 2, { width: summaryValueWidth, align: "right" });

    if (orderDoc.discount > 0 || orderDoc.couponDiscount > 0) {
      currentY += 35;
      const totalSavings = (orderDoc.discount || 0) + (orderDoc.couponDiscount || 0);
      doc.fontSize(9).fillColor("#16a34a")
        .text(`You saved ${totalSavings.toFixed(2)} on this order!`, 50, currentY, { align: "center" });
    }

    currentY += 40;
    if (currentY > 700) {
      doc.addPage();
      currentY = 50;
    }

   
    currentY += 55;
    doc.fontSize(9).fillColor("#2563eb")
      .text("Thank you for shopping with Ruhe Collection!", 50, currentY, { align: "center" });

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor("#9ca3af")
        .text(`Page ${i + 1} of ${pageCount}`, 50, doc.page.height - 50, { align: "center" });
    }

    doc.end();

  } catch (err) {
    console.error("Invoice error:", err);
    res.status(500).send("Failed to download invoice");
  }
};


const requestOrderReturn = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId)
      return res.status(401).json({ success: false, message: "Login first" });

    const { orderId } = req.params;
    const { reason, itemId } = req.body;

    const orderDoc = await Order.findOne({ _id: orderId, userId });
    if (!orderDoc)
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });

    if (!reason || reason.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Return reason is required",
      });
    }

    if (!itemId) {
      return res.status(400).json({
        success: false,
        message: "Item ID is required for return request",
      });
    }

    const item = orderDoc.orderedItem.find((i) => i._id.toString() === itemId);
    if (!item)
      return res
        .status(404)
        .json({ success: false, message: "Item not found" });

    if (item.status !== "Delivered") {
      return res.status(400).json({
        success: false,
        message: `This item cannot be returned. Current status: ${item.status}. Only delivered items can be returned.`,
      });
    }

    if (["Return Requested", "Return Approved", "Returned"].includes(item.status)) {
      return res.status(400).json({
        success: false,
        message: "This item is already in return process",
      });
    }

    const itemDeliveryDate = item.deliveredDate || orderDoc.deliveredDate || orderDoc.updatedAt;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    if (itemDeliveryDate < sevenDaysAgo) {
      return res.status(400).json({
        success: false,
        message: "Return window closed. Returns must be requested within 7 days of item delivery.",
      });
    }

    item.status = "Return Requested";
    item.returnReason = reason.trim();
    item.returnRequestDate = new Date();
    item.paymentStatus = "Return Requested";

    await orderDoc.save();

    res.json({
      success: true,
      message: "Return request submitted successfully. Awaiting admin approval.",
      item: item,
    });
  } catch (error) {
    console.error("Return request error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export default {
  getOrder,
  cancelOrder,
  getOrderDetails,
  downloadInvoice,
  requestOrderReturn,
};