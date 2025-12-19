import user from "../../model/userSchema.js";
import Order from "../../model/orderSchema.js";
import product from "../../model/productSchema.js";
import wallet from "../../model/walletSchema.js"
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
        success : false,
        message : " order not found"
      });
    }

    const userData = await user
      .findById(userId)
      .select("name email phone profileImage");

    if (!userData) {
      return res.status(400).json({
        success : false,
        message : " userData not found"
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
    orderDetails.deliveryCharge = (orderDetails.totalPrice-orderDetails.discount)>=500?0:50;
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

    if (!["Pending", "Processing"].includes(orderDoc.orderStatus))
      return res.status(400).json({
        success: false,
        message: `Cannot cancel order with status ${orderDoc.orderStatus}`,
      });

    if (cancelAll === "true" || cancelAll === true)
      return await cancelAllItems(orderDoc, reason, res);

    return await cancelSingleItem(orderDoc, itemId, reason, res);

  } catch (error) {
    console.error("Cancel error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

async function cancelAllItems(orderDoc, reason, res) {
  orderDoc.orderStatus = "Cancelled";
  orderDoc.cancellationReason = reason || "";

  const cancellableStatuses = ["Pending", "Processing", "Shipped"];
  const deliveredStatuses = ["Delivered"];

  for (const item of orderDoc.orderedItem) {
    if (cancellableStatuses.includes(item.status)) {
      item.status = "Cancelled";
      item.paymentStatus = "Pending";
      item.cancellationReason = reason || "";
      await restoreStock(item);
    }
  }

  const cancelledItems = orderDoc.orderedItem.filter(i => i.status === "Cancelled");
  const remainingItems = orderDoc.orderedItem.filter(i => deliveredStatuses.includes(i.status));

  if (remainingItems.length === 0) {

    const walletUsed = parseFloat(orderDoc.walletUsed || 0);

    orderDoc.totalPrice = 0;
    orderDoc.discount = 0;
    orderDoc.finalAmount = 0;
    orderDoc.walletUsed = 0;

    await orderDoc.save();

    if (walletUsed > 0) {
      await refundToWallet(orderDoc.userId, walletUsed);
    }

    return res.json({
      success: true,
      message: "Order fully cancelled and refunded",
      refundedToWallet: walletUsed
    });
  }

  let cancelledSum = cancelledItems.reduce(
    (sum, item) => sum + (item.price * item.quantity),
    0
  );

  const walletUsedBefore = parseFloat(orderDoc.walletUsed || 0);
  const refundAmount = Math.min(cancelledSum, walletUsedBefore);

  if (refundAmount > 0) {
    await refundToWallet(orderDoc.userId, refundAmount);
    orderDoc.walletUsed = walletUsedBefore - refundAmount;
  }

  let newBaseTotal = 0;
  let newOfferTotal = 0;

  for (const item of remainingItems) {
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
  orderDoc.finalAmount = newOfferTotal;

  orderDoc.orderStatus = "Delivered";

  await orderDoc.save();

  return res.json({
    success: true,
    message: "Order partially cancelled",
    refundedToWallet: refundAmount
  });
}

async function cancelSingleItem(orderDoc, itemId, reason, res) {
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

  const cancelledPrice = item.price * item.quantity;
  const walletUsedBefore = parseFloat(orderDoc.walletUsed || 0);
  const refundAmount = Math.min(cancelledPrice, walletUsedBefore);

  if (refundAmount > 0) {
    await refundToWallet(orderDoc.userId, refundAmount);
    orderDoc.walletUsed = walletUsedBefore - refundAmount;
  }

  const activeItems = orderDoc.orderedItem.filter(i => i.status !== "Cancelled");

  if (activeItems.length === 0) {
    orderDoc.orderStatus = "Cancelled";
    orderDoc.totalPrice = 0;
    orderDoc.discount = 0;
    orderDoc.finalAmount = 0;

    await orderDoc.save();

    return res.json({
      success: true,
      message: "Item cancelled and order closed",
      refundedToWallet: refundAmount
    });
  }

  let newBase = 0;
  let newDiscount = 0;

  for (const activeItem of activeItems) {
    const productDoc = await product.findById(activeItem.productId);
    if (!productDoc) continue;

    let variant = null;
   
    if (!variant && activeItem.ml)
      variant = productDoc.VariantItem.find(v => v.Ml === activeItem.ml);

    const basePrice = variant ? variant.Price : activeItem.price;
    const finalPrice = variant ? (variant.offerPrice || variant.Price) : activeItem.price;

    newBase += basePrice * activeItem.quantity;
    newDiscount += (basePrice - finalPrice) * activeItem.quantity;
  }

  const afterDiscount = newBase - newDiscount;
  const delivery = afterDiscount >= 500 ? 0 : 50;

  orderDoc.totalPrice = newBase;
  orderDoc.discount = newDiscount;
  orderDoc.finalAmount = afterDiscount + delivery;

  await orderDoc.save();

  return res.json({
    success: true,
    message: "Item cancelled and wallet refunded",
    refundedToWallet: refundAmount,
    newFinalAmount: orderDoc.finalAmount
  });
}

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

export const downloadInvoice = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.user;

    if (!userId) return res.status(401).send("Login first");

    const userData = await user.findById(userId);

    const orderDoc = await Order.findOne({ _id: orderId, userId }).populate(
      "orderedItem.productId"
    );

    if (!orderDoc) return res.status(404).send("Order not found");

    const invoiceName = `Invoice_${orderDoc.orderId}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${invoiceName}"`
    );

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    doc.pipe(res);

    doc
      .fontSize(24)
      .font("Helvetica-Bold")
      .text("Rube Collection", { align: "center" })
      .moveDown(0.3);

    doc
      .fontSize(10)
      .font("Helvetica")
      .text("Premium Fragrances & Perfumes", { align: "center" })
      .moveDown(0.8);

    doc
      .fontSize(18)
      .font("Helvetica-Bold")
      .fillColor("#333333")
      .text("INVOICE", { align: "center" })
      .moveDown(1);

    const orderDetailsY = doc.y;
    const leftCol = 50;
    const rightCol = 320;

    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor("#000000")
      .text("Order ID:", leftCol, orderDetailsY, { continued: true })
      .font("Helvetica")
      .text(` ${orderDoc.orderId}`);

    doc
      .font("Helvetica-Bold")
      .text("Invoice Date:", leftCol, orderDetailsY + 15, { continued: true })
      .font("Helvetica")
      .text(` ${orderDoc.createdAt.toLocaleDateString("en-GB")}`);

    doc
      .font("Helvetica-Bold")
      .text("Payment Method:", rightCol, orderDetailsY)
      .font("Helvetica")
      .text(`${orderDoc.payment || "COD"}`, rightCol + 115, orderDetailsY);

    doc
      .font("Helvetica-Bold")
      .text("Payment Status:", rightCol, orderDetailsY + 15)
      .font("Helvetica")
      .text(`${orderDoc.paymentStatus || "Pending"}`, rightCol + 115, orderDetailsY + 15);

    doc.moveDown(3);

    const address = orderDoc?.shippingAddress?.[0] || {};
    const billingY = doc.y;

    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("Billing & Shipping Address:", 50, billingY)
      .moveDown(0.5);

    doc
      .fontSize(10)
      .font("Helvetica")
      .text(`${userData?.name || "Customer"}`, 50)
      .text(`${address.flatNumber || ""} ${address.streetName || ""}`.trim(), 50)
      .text(address.landMark ? `Landmark: ${address.landMark}` : "", 50)
      .text(`${address.city || ""}, ${address.state || ""} - ${address.pincode || ""}`.replace(/^, | - $|^- $/, ""), 50)
      .text(`Phone: ${address.phone || ""}`, 50)
      .moveDown(1.5);

    const tableTop = doc.y + 10;
    const tableLeft = 50;
    const tableWidth = 500;

    const cols = {
      sno: { x: tableLeft + 5, width: 35 },
      product: { x: tableLeft + 45, width: 195 },
      size: { x: tableLeft + 245, width: 55 },
      qty: { x: tableLeft + 305, width: 45 },
      price: { x: tableLeft + 355, width: 70 },
      total: { x: tableLeft + 430, width: 70 }
    };

    doc
      .rect(tableLeft, tableTop, tableWidth, 25)
      .fillAndStroke("#4B5563", "#4B5563");

    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor("#FFFFFF")
      .text("S.No", cols.sno.x + 5, tableTop + 8, { width: cols.sno.width - 10, align: "center" })
      .text("Product Name", cols.product.x + 5, tableTop + 8, { width: cols.product.width - 10, align: "left" })
      .text("Size", cols.size.x, tableTop + 8, { width: cols.size.width, align: "center" })
      .text("Qty", cols.qty.x, tableTop + 8, { width: cols.qty.width, align: "center" })
      .text("Price", cols.price.x, tableTop + 8, { width: cols.price.width - 5, align: "right" })
      .text("Total", cols.total.x, tableTop + 8, { width: cols.total.width - 5, align: "right" });

    let currentY = tableTop + 25;
    doc.fillColor("#000000").font("Helvetica");

    orderDoc.orderedItem.forEach((item, i) => {
      const rowHeight = 30;
      
      if (i % 2 === 0) {
        doc
          .rect(tableLeft, currentY, tableWidth, rowHeight)
          .fillAndStroke("#F9FAFB", "#E5E7EB");
      } else {
        doc
          .rect(tableLeft, currentY, tableWidth, rowHeight)
          .stroke("#E5E7EB");
      }

      const itemTotal = (item.price * item.quantity).toFixed(2);
      const textY = currentY + 10;

      doc
        .fontSize(9)
        .fillColor("#000000")
        .text(i + 1, cols.sno.x + 5, textY, { width: cols.sno.width - 10, align: "center" })
        .text(
          item.productId?.productName || "Product",
          cols.product.x + 5,
          textY,
          { width: cols.product.width - 10, align: "left", ellipsis: true }
        )
        .text(
          item.ml ? `${item.ml} ML` : "-",
          cols.size.x,
          textY,
          { width: cols.size.width, align: "center" }
        )
        .text(
          item.quantity.toString(),
          cols.qty.x,
          textY,
          { width: cols.qty.width, align: "center" }
        )
        .text(
          `Rs. ${item.price.toFixed(2)}`,
          cols.price.x,
          textY,
          { width: cols.price.width - 5, align: "right" }
        )
        .text(
          `Rs. ${itemTotal}`,
          cols.total.x,
          textY,
          { width: cols.total.width - 5, align: "right" }
        );

      currentY += rowHeight;
    });

    doc
      .moveTo(tableLeft, currentY)
      .lineTo(tableLeft + tableWidth, currentY)
      .stroke("#E5E7EB");

    currentY += 30;

    const summaryBoxLeft = tableLeft + 300;
    const summaryBoxWidth = 200;
    
    const summaryBoxTop = currentY - 5;
    const summaryBoxHeight = orderDoc.discount && orderDoc.discount > 0 ? 115 : 90;
    
    doc
      .rect(summaryBoxLeft, summaryBoxTop, summaryBoxWidth, summaryBoxHeight)
      .fillAndStroke("#F9FAFB", "#E5E7EB");

    currentY += 5;

    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#000000");

    const labelX = summaryBoxLeft + 10;
    const valueX = summaryBoxLeft + summaryBoxWidth - 10;
    
    doc
      .text("Subtotal:", labelX, currentY, { width: 100, align: "left" })
      .text(`Rs. ${orderDoc.totalPrice.toFixed(2)}`, valueX - 80, currentY, { width: 80, align: "right" });

    currentY += 20;

    if (orderDoc.discount && orderDoc.discount > 0) {
      doc
        .fillColor("#059669")
        .text("Discount:", labelX, currentY, { width: 100, align: "left" })
        .text(`- Rs. ${orderDoc.discount.toFixed(2)}`, valueX - 80, currentY, { width: 80, align: "right" })
        .fillColor("#000000");

      currentY += 20;
    }

    doc
      .moveTo(summaryBoxLeft + 10, currentY + 5)
      .lineTo(summaryBoxLeft + summaryBoxWidth - 10, currentY + 5)
      .stroke("#9CA3AF");

    currentY += 15;

    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .fillColor("#1F2937")
      .text("Total Amount:", labelX, currentY, { width: 100, align: "left" })
      .text(`Rs. ${orderDoc.finalAmount.toFixed(2)}`, valueX - 80, currentY, { width: 80, align: "right" })
      .fillColor("#000000");

    doc
      .moveDown(4)
      .fontSize(10)
      .font("Helvetica-Oblique")
      .fillColor("#6B7280")
      .text("Thank you for shopping with Rube Collection!", { align: "center" })
      .moveDown(0.5)
      .fontSize(8)
      .text("For any queries, please contact our customer support", { align: "center" });

    const borderPadding = 40;
    const borderHeight = Math.min(doc.y + 20, 750); 
    doc
      .rect(borderPadding, borderPadding, 515, borderHeight - borderPadding)
      .stroke("#D1D5DB");

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