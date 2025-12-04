import user from "../../model/userSchema.js";
import Order from "../../model/orderSchema.js";
import product from "../../model/productSchema.js";
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
    orderDetails.deliveryCharge = 0;
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
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });

    if (!["Pending", "Processing"].includes(orderDoc.orderStatus))
      return res.status(400).json({
        success: false,
        message: `Cannot cancel order with status ${orderDoc.orderStatus}`,
      });

    if (cancelAll === "true" || cancelAll === true) {
      orderDoc.orderStatus = "Cancelled";
      orderDoc.cancellationReason = reason || "";

      for (const item of orderDoc.orderedItem) {
        item.status = "Cancelled";
        item.cancellationReason = reason || "";
        await restoreStock(item);
      }

      await orderDoc.save();
      return res.json({ success: true, message: "Order cancelled" });
    }

    const item = orderDoc.orderedItem.find((i) => i._id.toString() === itemId);
    if (!item)
      return res
        .status(404)
        .json({ success: false, message: "Item not found" });

    if (!["Pending", "Processing"].includes(item.status))
      return res
        .status(400)
        .json({ success: false, message: "Item cannot be cancelled now" });

    item.status = "Cancelled";
    item.cancellationReason = reason || "";

    await restoreStock(item);

    if (orderDoc.orderedItem.every((i) => i.status === "Cancelled")) {
      orderDoc.orderStatus = "Cancelled";
    }

    await orderDoc.save();

    res.json({ success: true, message: "Item cancelled successfully" });
  } catch (error) {
    console.error("Cancel error:", error);
    res.status(500).json({ success: false, message: "Server error" });
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

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    doc.fontSize(22).text("Rube Collection", { align: "center" }).moveDown(0.5);

    doc.fontSize(14).text("INVOICE", { align: "center" }).moveDown(1);

    doc
      .fontSize(12)
      .text(`Order ID : ${orderDoc.orderId}`)
      .text(`Date     : ${orderDoc.createdAt.toDateString()}`)
      .moveDown(1);

    doc.fontSize(14).text("Billing / Shipping Details:", { underline: true });

    const address = orderDoc?.shippingAddress?.[0] || {};

    doc
      .fontSize(12)
      .text(`Name      : ${userData?.name || "Customer"}`)
      .text(
        `Address   : ${address.flatNumber || ""} ${address.streetName || ""}`
      )
      .text(`Landmark  : ${address.landMark || ""}`)
      .text(`City      : ${address.city || ""}`)
      .text(`State     : ${address.state || ""}`)
      .text(`Pincode   : ${address.pincode || ""}`)
      .text(`Phone     : ${address.phone || ""}`)
      .moveDown(1);

    doc.fontSize(14).text("Items:", { underline: true }).moveDown(0.5);

    orderDoc.orderedItem.forEach((item, i) => {
      doc
        .fontSize(12)
        .text(`${i + 1}. ${item.productId.productName}`)
        .text(`   ML: ${item.ml || "-"}`)
        .text(`   Qty: ${item.quantity}`)
        .text(`   Price: ₹${item.price}`)
        .moveDown(0.5);
    });

    doc.moveDown(1);

    doc
      .fontSize(14)
      .text("Payment Summary:", { underline: true })
      .moveDown(0.5);

    doc
      .fontSize(12)
      .text(`Subtotal     : ₹${orderDoc.totalPrice}`)
      .text(`Discount     : ₹${orderDoc.discount}`)
      .text(`Final Amount : ₹${orderDoc.finalAmount}`)
      .moveDown(2);

    doc.text("Thank you for shopping with Rube Collection!", {
      align: "center",
    });

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
    const { reason, itemId, returnAll } = req.body;

    const orderDoc = await Order.findOne({ _id: orderId, userId });
    if (!orderDoc)
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });

    if (orderDoc.orderStatus !== "Delivered") {
      return res.status(400).json({
        success: false,
        message: "Only delivered orders can be returned",
      });
    }

    const latestDeliveryDate = orderDoc.orderedItem.reduce((latest, item) => {
      if (item.deliveredDate && item.deliveredDate > latest) {
        return item.deliveredDate;
      }
      return latest;
    }, orderDoc.deliveredDate || orderDoc.updatedAt);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    if (latestDeliveryDate < sevenDaysAgo) {
      return res.status(400).json({
        success: false,
        message:
          "Return window closed. Returns must be requested within 7 days of delivery.",
      });
    }

    if (
      [
        "Return Requested",
        "Return Approved",
        "Return Rejected",
        "Returned",
      ].includes(orderDoc.orderStatus)
    ) {
      return res.status(400).json({
        success: false,
        message: "Return request already submitted for this order",
      });
    }

    if (!reason || reason.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Return reason is required",
      });
    }

    if (returnAll === "true" || returnAll === true) {
      orderDoc.orderedItem.forEach((item) => {
        if (item.status === "Delivered") {
          item.status = "Return Requested";
          item.returnReason = reason.trim();
          item.returnRequestDate = new Date();
        }
      });

      orderDoc.orderStatus = "Return Requested";
      orderDoc.returnRequestDate = new Date();
      orderDoc.returnReason = reason.trim();

      await orderDoc.save();

      return res.json({
        success: true,
        message:
          "Return request submitted for entire order. Awaiting admin approval.",
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
        message: "Only delivered items can be returned",
      });
    }

    item.status = "Return Requested";
    item.returnReason = reason.trim();
    item.returnRequestDate = new Date();

    orderDoc.returnRequestDate = new Date();
    orderDoc.orderStatus = "Return Requested";
    orderDoc.returnReason = reason.trim();

    await orderDoc.save();

    res.json({
      success: true,
      message:
        "Return request submitted successfully. Awaiting admin approval.",
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
