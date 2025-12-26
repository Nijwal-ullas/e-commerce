import razorpay from "../../helpers/razorpay.js"; 
import Order from "../../model/orderSchema.js";
import Cart from "../../model/cartSchema.js";
import Product from "../../model/productSchema.js";
import Address from "../../model/addressSchema.js";
import crypto from "crypto";



export const createRazorpayOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    const { addressId, couponCode: inputCouponCode } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Login first" });
    }
    
    if (!addressId) {
      return res.status(400).json({ success: false, message: "Address is required" });
    }

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ 
        success: false, 
        message: "Payment gateway not configured. Please contact support." 
      });
    }

    let cartItems = [];
    let isBuyNow = false;
    
    if (req.session.buyNowItem) {
      isBuyNow = true;
      const buyNowItem = req.session.buyNowItem;
      const productData = await Product.findById(buyNowItem.productId);
      
      if (!productData) {
        delete req.session.buyNowItem;
        return res.status(400).json({ success: false, message: "Product not found" });
      }
      
      cartItems = [{
        packageProductId: productData,
        variantId: buyNowItem.variantId,
        variantMl: buyNowItem.variantMl,
        price: buyNowItem.price,
        oldPrice: buyNowItem.oldPrice,
        quantity: buyNowItem.quantity,
        totalPrice: buyNowItem.totalPrice,
        variantName: buyNowItem.variantName || `${buyNowItem.variantMl}ml`
      }];
    } else {
      const cartDoc = await Cart.findOne({ userId: userId }).populate("cart_items.packageProductId");
      
      if (!cartDoc || !cartDoc.cart_items || cartDoc.cart_items.length === 0) {
        return res.status(400).json({ success: false, message: "Cart is empty" });
      }
      
      cartItems = cartDoc.cart_items;
    }

    let totalPrice = 0;
    let totalDiscount = 0;
    let hasOutOfStock = false;

    const orderedItem = cartItems.map((item) => {
      const productDoc = item.packageProductId;
      if (!productDoc) return null;

      let variantDoc = null;
      if (item.variantId && productDoc.VariantItem) {
        variantDoc = productDoc.VariantItem.find(
          (v) => v._id.toString() === item.variantId.toString()
        );
      }
      
      if (!variantDoc && item.variantMl && productDoc.VariantItem) {
        variantDoc = productDoc.VariantItem.find((v) => v.Ml === parseInt(item.variantMl));
      }
      
      if (!variantDoc && item.variantName && productDoc.VariantItem) {
        const mlFromName = parseInt(item.variantName.replace('ml', '').trim());
        variantDoc = productDoc.VariantItem.find((v) => v.Ml === mlFromName);
      }

      const originalPrice = variantDoc ? variantDoc.Price : (productDoc.price || 0);
      const offerPrice = variantDoc ? (variantDoc.offerPrice || variantDoc.Price) : (productDoc.offerPrice || originalPrice);
      const finalPrice = offerPrice;

      const itemOriginalTotal = originalPrice * item.quantity;
      const itemFinalTotal = finalPrice * item.quantity;
      const itemDiscount = itemOriginalTotal - itemFinalTotal;

      totalPrice += itemOriginalTotal;
      totalDiscount += itemDiscount;

      if (variantDoc && variantDoc.Quantity < item.quantity) {
        hasOutOfStock = true;
      }

      const mlValue = variantDoc ? variantDoc.Ml : (item.variantMl || item.ml || null);

      return {
        productId: productDoc._id,
        variantId: variantDoc ? variantDoc._id : (item.variantId || null),
        ml: mlValue,
        quantity: item.quantity,

        price: finalPrice,
        originalPrice: originalPrice,
        status: "Pending",
        paymentStatus: "Pending",
        productName: productDoc.productName,
        oldPrice: originalPrice,
        hasDiscount: variantDoc && variantDoc.offerPrice && variantDoc.Price > variantDoc.offerPrice
      };
    }).filter(Boolean);

    if (hasOutOfStock) {
      return res.status(400).json({
        success: false,
        message: "Some items are out of stock",
      });
    }

    const afterDiscount = totalPrice - totalDiscount;

    let couponDiscount = 0;
    let appliedCouponId = null;
    let couponCode = '';
    let couponDetails = null;

    let effectiveCouponCode = inputCouponCode || (req.session.appliedCoupon ? req.session.appliedCoupon.code : null);

    if (effectiveCouponCode) {
      const Coupons = (await import("../../model/couponSchema.js")).default;
      
      const coupon = await Coupons.findOne({
        code: effectiveCouponCode,
        status: true,
        expireAt: { $gt: new Date() }
      });

      if (!coupon) {
        return res.status(400).json({
          success: false,
          message: "Invalid or expired coupon"
        });
      }

      const userOrdersWithCoupon = await Order.countDocuments({
        userId: userId,
        couponCode: effectiveCouponCode
      });

      if (userOrdersWithCoupon >= 1) {
        return res.status(400).json({
          success: false,
          message: "You have already used this coupon"
        });
      }

      if (afterDiscount < coupon.minCartValue) {
        return res.status(400).json({
          success: false,
          message: `Minimum cart value ₹${coupon.minCartValue} required for this coupon`
        });
      }

      couponDiscount = Math.min(coupon.discountValue, afterDiscount);
      appliedCouponId = coupon._id;
      couponCode = coupon.code;
      couponDetails = {
        code: coupon.code,
        discountValue: coupon.discountValue,
        description: coupon.description,
        minCartValue: coupon.minCartValue
      };
    }

    const deliveryCharge = afterDiscount >= 500 ? 0 : 50;
    const afterCouponDiscount = afterDiscount - couponDiscount;
    const finalAmount = afterCouponDiscount + deliveryCharge;

    for (const cartItem of cartItems) {
      const productDoc = cartItem.packageProductId;
      if (!productDoc) continue;

      if (productDoc.VariantItem && productDoc.VariantItem.length > 0) {
        let variantDoc = null;
        
        if (cartItem.variantId) {
          variantDoc = productDoc.VariantItem.find(
            (v) => v._id.toString() === cartItem.variantId.toString()
          );
        }
        
        if (!variantDoc && cartItem.variantMl) {
          variantDoc = productDoc.VariantItem.find((v) => v.Ml === parseInt(cartItem.variantMl));
        }
        
        if (!variantDoc && cartItem.variantName) {
          const mlFromName = parseInt(cartItem.variantName.replace('ml', '').trim());
          variantDoc = productDoc.VariantItem.find((v) => v.Ml === mlFromName);
        }

        if (!variantDoc) {
          return res.status(400).json({
            success: false,
            message: `Variant not found for ${productDoc.productName}`,
          });
        }

        if (variantDoc.Quantity < cartItem.quantity) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${productDoc.productName}`,
          });
        }
      }
    }

    const addressData = await Address.findById(addressId);
    if (!addressData) {
      return res.status(400).json({ success: false, message: "Invalid address" });
    }

    const newOrder = new Order({
      userId,
      address: addressId,
      payment: "Razorpay",
      paymentStatus: "Pending",
      orderedItem,
      totalPrice: totalPrice,
      discount: totalDiscount,
      couponId: appliedCouponId,
      couponCode: couponCode || null,
      couponDiscount: couponDiscount,
      finalAmount: finalAmount,
      shippingCharge: deliveryCharge,
      shippingAddress: [
        {
          addressType: addressData.addressType,
          city: addressData.city,
          country: addressData.country,
          phone: addressData.phone,
          pincode: addressData.pincode,
          state: addressData.state,
          landmark: addressData.landMark,
          flatNumber: addressData.flatNumber,
          streetName: addressData.streetName,
          alterPhone: addressData.alternativePhone,
        },
      ],
      orderStatus: "Pending",
    });

    await newOrder.save();

    const razorpayOptions = {
      amount: Math.round(finalAmount * 100), 
      currency: "INR",
      receipt: `order_${newOrder._id}`,
      notes: {
        order_id: newOrder._id.toString(),
        user_id: userId.toString(),
        coupon_code: couponCode || "none",
        coupon_discount: couponDiscount
      }
    };

    let razorpayOrder;
    try {
      razorpayOrder = await razorpay.orders.create(razorpayOptions);
    } catch (razorpayError) {
      console.error("Razorpay Error:", razorpayError);
      
      await Order.findByIdAndDelete(newOrder._id);
      
      return res.status(500).json({ 
        success: false, 
        message: `Payment gateway error: ${razorpayError.message || 'Failed to create payment order'}` 
      });
    }

    newOrder.razorpayOrderId = razorpayOrder.id;
    await newOrder.save();

    delete req.session.appliedCoupon;

    res.json({
      success: true,
      orderId: newOrder._id,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key_id: process.env.RAZORPAY_KEY_ID,
      isBuyNow: isBuyNow,
      couponApplied: couponCode ? true : false,
      couponDiscount: couponDiscount,
      finalAmount: finalAmount
    });

  } catch (err) {
    console.error("Create Razorpay Order Error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Order creation failed. Please try again." 
    });
  }
};


export const verifyPayment = async (req, res) => {
  try {
    const { 
      razorpay_payment_id, 
      razorpay_order_id, 
      razorpay_signature,
      orderId 
    } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ 
        success: false, 
        message: "Payment verification failed: Invalid signature" 
      });
    }

    const orderDoc = await Order.findById(orderId);
    if (!orderDoc) {
      return res.status(404).json({ 
        success: false, 
        message: "Order not found" 
      });
    }

    if (orderDoc.paymentStatus === "Paid") {
      return res.json({ 
        success: true, 
        message: "Payment already verified", 
        orderId 
      });
    }

    orderDoc.paymentStatus = "Paid";
    orderDoc.orderStatus = "Pending";
    orderDoc.razorpayPaymentId = razorpay_payment_id;
    orderDoc.razorpaySignature = razorpay_signature;
    orderDoc.paymentDate = new Date();
    
    orderDoc.orderedItem.forEach(item => {
      item.status = "Pending";
      item.paymentStatus = "Paid";
    });

    await orderDoc.save();

    for (const item of orderDoc.orderedItem) {
      try {
        const prod = await Product.findById(item.productId);
        if (prod && prod.VariantItem) {
          const variant = prod.VariantItem.id(item.variantId);
          if (variant) {
            variant.Quantity -= item.quantity;
            await prod.save();
          }
        }
      } catch (stockError) {
        console.error("Stock update error for product:", item.productId, stockError);
      }
    }

    const isBuyNow = req.session.buyNowItem !== undefined;
    
    if (isBuyNow) {
      delete req.session.buyNowItem;
    } else {
      await Cart.findOneAndUpdate(
        { userId: orderDoc.userId }, 
        { cart_items: [] }
      );
    }

    delete req.session.appliedCoupon;

    res.json({ 
      success: true, 
      message: "Payment verified successfully", 
      orderId,
      couponCode: orderDoc.couponCode,
      couponDiscount: orderDoc.couponDiscount
    });

  } catch (err) {
    console.error("Verify Payment Error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Payment verification failed. Please contact support." 
    });
  }
};

const handlePaymentFailure = async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Login first" });
    }

    const orderDoc = await Order.findOneAndUpdate(
      { 
        _id: orderId, 
        userId: userId,
        paymentStatus: "Pending"
      },
      {
        paymentStatus: "Failed",   
        orderStatus: "Payment Failed",
        failedAt: new Date(),     
        $inc: { retryAttempts: 1 } 
      },
      { new: true }
    );

    if (orderDoc) {
      req.session.pendingRetryOrder = orderId;
      
      return res.json({ 
        success: true, 
        message: "Payment failed, order marked for retry",
        orderId: orderId
      });
    }

    return res.json({
      success: true
    });

  } catch (err) {
    console.error("Payment failure handler error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to handle payment failure" 
    });
  }
};



const orderFailurePage = async (req, res) => {
  try {
    const failedOrderId = req.session.pendingRetryOrder || null;
    
    res.render("user/orderFailurePage", {
      failedOrderId: failedOrderId,
      user: req.session.user || null
    });
  } catch (err) {
    console.error("Order failure page error:", err);
    res.render("user/orderFailurePage", {
      failedOrderId: null,
      user: req.session.user || null
    });
  }
};


export const retryPayment = async (req, res) => {
  try {
    const userId = req.session.user;
    const { orderId } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Login first" });
    }

    const pendingOrderId = req.session.pendingRetryOrder || orderId;

    if (!pendingOrderId) {
      return res.status(400).json({ 
        success: false, 
        message: "No failed order found. Please start a new order." 
      });
    }

    const failedOrder = await Order.findOne({
      _id: pendingOrderId,
      userId: userId,
      paymentStatus: "Failed"
    });

    if (!failedOrder) {
      return res.status(404).json({ 
        success: false, 
        message: "Order not found or already completed" 
      });
    }

    const maxRetryAttempts = 3; 
    if (failedOrder.retryAttempts >= maxRetryAttempts) {
      return res.status(400).json({
        success: false,
        message: "Maximum retry attempts reached. Please contact support."
      });
    }

    const razorpayOptions = {
      amount: Math.round(failedOrder.finalAmount * 100),
      currency: "INR",
      receipt: `order_${failedOrder._id}_retry`,
      notes: {
        order_id: failedOrder._id.toString(),
        user_id: userId.toString(),
        coupon_code: failedOrder.couponCode || "none",
        is_retry: true
      }
    };

    let razorpayOrder;
    try {
      razorpayOrder = await razorpay.orders.create(razorpayOptions);
    } catch (razorpayError) {
      console.error("Razorpay retry error:", razorpayError);
      return res.status(500).json({ 
        success: false, 
        message: `Payment gateway error: ${razorpayError.message}` 
      });
    }

    failedOrder.razorpayOrderId = razorpayOrder.id;
    failedOrder.paymentStatus = "Pending"; 
    failedOrder.orderStatus = "Pending";
    failedOrder.retryAttempts += 1;  
    failedOrder.lastRetryAt = new Date();
    await failedOrder.save();

    delete req.session.pendingRetryOrder;

    res.json({
      success: true,
      orderId: failedOrder._id,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key_id: process.env.RAZORPAY_KEY_ID,
      isRetry: true
    });

  } catch (err) {
    console.error("Retry payment error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to retry payment. Please try again." 
    });
  }
};


export default {
  createRazorpayOrder,
  verifyPayment,
  handlePaymentFailure,
  orderFailurePage,
  retryPayment
};