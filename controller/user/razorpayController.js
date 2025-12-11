import razorpay from "../../helpers/razorpay.js"; 
import Order from "../../model/orderSchema.js";
import Cart from "../../model/cartSchema.js";
import Product from "../../model/productSchema.js";
import Address from "../../model/addressSchema.js";
import crypto from "crypto";



export const createRazorpayOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    const { addressId } = req.body;

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
        status: "Pending",
        paymentStatus: "Pending",
        productName: productDoc.productName,
        originalPrice: originalPrice,
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
    const deliveryCharge = afterDiscount >= 500 ? 0 : 50;
    const finalAmount = afterDiscount + deliveryCharge;

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
      finalAmount: finalAmount,
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
        user_id: userId.toString()
      }
    };

    
    let razorpayOrder;
    try {
      razorpayOrder = await razorpay.orders.create(razorpayOptions);
      
    } catch (razorpayError) {
      console.error("Error message:", razorpayError.message);
      
      await Order.findByIdAndDelete(newOrder._id);
      
      return res.status(500).json({ 
        success: false, 
        message: `Payment gateway error: ${razorpayError.message || 'Failed to create payment order'}` 
      });
    }

    newOrder.razorpayOrderId = razorpayOrder.id;
    await newOrder.save();


    res.json({
      success: true,
      orderId: newOrder._id,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key_id: process.env.RAZORPAY_KEY_ID,
      isBuyNow: isBuyNow
    });

  } catch (err) {
  
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
    orderDoc.orderStatus = "Processing";
    orderDoc.razorpayPaymentId = razorpay_payment_id;
    orderDoc.razorpaySignature = razorpay_signature;
    orderDoc.paymentDate = new Date();
    
    orderDoc.orderedItem.forEach(item => {
      item.status = "Processing";
      item.paymentStatus = "Paid";
    });

    await orderDoc.save();

    for (const item of orderDoc.orderedItem) {
      try {
        const prod = await Product.findById(item.productId);
        if (prod && prod.VariantItem) {
          const variant = prod.VariantItem.id(item.variantId);
          if (variant) {
            const oldQuantity = variant.Quantity;
            variant.Quantity -= item.quantity;
            await prod.save();
          }
        }
      } catch (stockError) {
        console.error(" Stock update error for product:", item.productId, stockError);
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


    res.json({ 
      success: true, 
      message: "Payment verified successfully", 
      orderId 
    });

  } catch (err) {
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

    const orderDoc = await Order.findOneAndDelete({ 
      _id: orderId, 
      userId: userId,
      paymentStatus: "Pending"
    });

    if (orderDoc) {
      return res.json({ 
        success: true, 
        message: "Order cancelled due to payment failure" 
      });
    }

    res.json({ 
      success: true, 
      message: "Order not found or already processed" 
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: "Failed to handle payment failure" 
    });
  }
};


export default {
  createRazorpayOrder,
  verifyPayment,
  handlePaymentFailure,
};