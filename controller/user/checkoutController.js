import user from "../../model/userSchema.js";
import cart from "../../model/cartSchema.js";
import address from "../../model/addressSchema.js";
import order from "../../model/orderSchema.js";
import product from "../../model/productSchema.js";
import wallet from "../../model/walletSchema.js";
import Coupons from "../../model/couponSchema.js";

const nameRegex = /^[A-Za-z\s]{6,30}$/;
const pincodeRegex = /^\d{6}$/;
const phoneRegex = /^[6-9]\d{9}$/;

const getCheckout = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.redirect("/login");
    }

    const userData = await user.findById(userId);
    const userWallet = await wallet.findOne({ UserId: userId });
    const walletBalance = parseFloat(userWallet?.Balance) || 0;

    let cartData = null;
    let cartItems = [];
    let totalPrice = 0;
    let subtotal = 0;
    let totalDiscount = 0;
    let hasOutOfStock = false;
    let isBuyNow = false;
    let buyNowItem = null;

    let couponDiscount = 0;
    let couponCode = '';
    let couponError = '';
    let appliedCoupon = null;

    if (req.session.buyNowItem) {
      isBuyNow = true;
      buyNowItem = req.session.buyNowItem;
      const productData = await product.findById(buyNowItem.productId);
      
      if (!productData) {
        delete req.session.buyNowItem;
        return res.redirect("/cart");
      }
      
      let variantDoc = null;
      if (productData.VariantItem && productData.VariantItem.length > 0) {
        if (buyNowItem.variantId) {
          variantDoc = productData.VariantItem.find(
            v => v._id.toString() === buyNowItem.variantId.toString()
          );
        }
        if (!variantDoc && buyNowItem.variantMl) {
          variantDoc = productData.VariantItem.find(v => v.Ml === parseInt(buyNowItem.variantMl));
        }
      }

      const originalPrice = variantDoc ? variantDoc.Price : buyNowItem.originalPrice || buyNowItem.price;
      const currentPrice = variantDoc ? (variantDoc.offerPrice || variantDoc.Price) : buyNowItem.price;
      const itemTotal = currentPrice * (buyNowItem.quantity || 1);
      const itemOriginalTotal = originalPrice * (buyNowItem.quantity || 1);
      
      totalPrice = itemOriginalTotal;
      subtotal = itemTotal;
      totalDiscount = itemOriginalTotal - itemTotal;
      
      if (variantDoc && variantDoc.Quantity < (buyNowItem.quantity || 1)) {
        hasOutOfStock = true;
      }

      cartItems = [{
        packageProductId: productData,
        variantId: variantDoc ? variantDoc._id : buyNowItem.variantId,
        variantMl: variantDoc ? variantDoc.Ml : buyNowItem.variantMl,
        variantName: variantDoc ? `${variantDoc.Ml}ml` : `${buyNowItem.variantMl}ml`,
        price: currentPrice,
        originalPrice: originalPrice,
        quantity: buyNowItem.quantity || 1,
        totalPrice: itemTotal,
        originalTotal: itemOriginalTotal,
        hasDiscount: variantDoc && variantDoc.offerPrice && variantDoc.Price > variantDoc.offerPrice,
        discountPercentage: variantDoc && variantDoc.offerPrice && variantDoc.Price > variantDoc.offerPrice ? 
          Math.round(((originalPrice - currentPrice) / originalPrice) * 100) : 0
      }];
      
    } else {
      cartData = await cart
        .findOne({ userId: userId })
        .populate("cart_items.packageProductId");

      if (!cartData || !cartData.cart_items || cartData.cart_items.length === 0) {
        return res.redirect("/cart");
      }

      cartItems = cartData.cart_items.map(item => {
        const productDoc = item.packageProductId;
        if (!productDoc) return null;

        let variantDoc = null;
        if (productDoc.VariantItem && productDoc.VariantItem.length > 0) {
          if (item.variantId) {
            variantDoc = productDoc.VariantItem.find(
              v => v._id.toString() === item.variantId.toString()
            );
          }
          if (!variantDoc && item.variantMl) {
            variantDoc = productDoc.VariantItem.find(v => v.Ml === parseInt(item.variantMl));
          }
          if (!variantDoc && item.variantName) {
            const mlFromName = parseInt(item.variantName.replace('ml', '').trim());
            variantDoc = productDoc.VariantItem.find(v => v.Ml === mlFromName);
          }
        }

        const originalPrice = variantDoc ? variantDoc.Price : (item.originalPrice || item.price || 0);
        const currentPrice = variantDoc ? (variantDoc.offerPrice || variantDoc.Price) : (item.price || 0);
        const itemTotal = currentPrice * item.quantity;
        const itemOriginalTotal = originalPrice * item.quantity;
        const itemDiscount = itemOriginalTotal - itemTotal;
        
        totalPrice += itemOriginalTotal;
        subtotal += itemTotal;
        totalDiscount += itemDiscount;

        if (variantDoc && variantDoc.Quantity < item.quantity) {
          hasOutOfStock = true;
        }

        return {
          ...item.toObject(),
          variantData: variantDoc,
          price: currentPrice,
          originalPrice: originalPrice,
          totalPrice: itemTotal,
          originalTotal: itemOriginalTotal,
          hasDiscount: variantDoc && variantDoc.offerPrice && variantDoc.Price > variantDoc.offerPrice,
          discountPercentage: variantDoc && variantDoc.offerPrice && variantDoc.Price > variantDoc.offerPrice ? 
            Math.round(((originalPrice - currentPrice) / originalPrice) * 100) : 0,
          variantName: variantDoc ? `${variantDoc.Ml}ml` : (item.variantName || ''),
          stock: variantDoc ? variantDoc.Quantity : 0
        };
      }).filter(Boolean);
    }

    const shipping = subtotal >= 500 ? 0 : 50;
    
    if (req.session.appliedCoupon) {
      const appliedCouponData = req.session.appliedCoupon;
      
      if (subtotal >= appliedCouponData.minCartValue) {
        couponDiscount = Math.min(appliedCouponData.discountValue, subtotal);
        couponCode = appliedCouponData.code;
        appliedCoupon = appliedCouponData;
      } else {
        couponError = `Minimum cart value ₹${appliedCouponData.minCartValue} required for this coupon. Your cart total is ₹${subtotal.toFixed(2)}`;
        delete req.session.appliedCoupon;
      }
    }

    const afterCouponDiscount = subtotal - couponDiscount;
    const finalAmount = afterCouponDiscount + shipping;

    const page = parseInt(req.query.page) || 1;
    const limit = 3;
    const skip = (page - 1) * limit;
    const totalAddresses = await address.countDocuments({ userId });
    const totalPage = Math.ceil(totalAddresses / limit);
    const userAddress = await address
      .find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.render("user/checkoutPage", {
      user: userData,
      cart: cartData || { cart_items: cartItems },
      cartItems: cartItems,
      addresses: userAddress,
      page,
      totalPage,
      isBuyNow,
      buyNowItem,
      totalPrice: totalPrice,
      discount: totalDiscount,
      shipping: shipping,
      finalAmount: finalAmount,
      subtotal: subtotal,
      couponDiscount: couponDiscount,
      couponCode: couponCode,
      appliedCoupon: appliedCoupon,
      couponError: couponError,
      hasOverallDiscount: totalDiscount > 0 || couponDiscount > 0,
      hasOutOfStockItems: hasOutOfStock,
      walletBalance: walletBalance
    });
  } catch (error) {
    console.log("Get Checkout Error:", error);
    return res.status(500).send("Server Error");
  }
};

const checkCouponAvailability = async (userId, couponCode) => {
  const coupon = await Coupons.findOne({
    code: couponCode,
    status: true,
    expireAt: { $gt: new Date() }
  });

  if (!coupon) {
    return { available: false, reason: "Invalid or expired coupon" };
  }

  // if (coupon.maxUsage && coupon.totalUsage >= coupon.maxUsage) {
  //   return { available: false, reason: "Coupon usage limit reached" };
  // }

  const userActiveUsage = await order.countDocuments({
    userId: userId,
    couponCode: coupon.code,
    orderStatus: { $nin: ["Cancelled", "Returned"] }
  });

  if (userActiveUsage >= coupon.maxUsagePerUser) {
    return { 
      available: false, 
      reason: `You can only use this coupon ${coupon.maxUsagePerUser} time${coupon.maxUsagePerUser > 1 ? 's' : ''}` 
    };
  }

  return { available: true, coupon };
};

const applyCoupon = async (req, res) => {
  try {
    const { couponCode } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Please login first"
      });
    }

    if (!couponCode || couponCode.trim() === '') {
      return res.status(400).json({
        success: false,
        message: "Coupon code is required"
      });
    }

    const couponCheck = await checkCouponAvailability(userId, couponCode.trim().toUpperCase());
    
    if (!couponCheck.available) {
      return res.status(400).json({
        success: false,
        message: couponCheck.reason || "Invalid coupon"
      });
    }

    const coupon = couponCheck.coupon;

    let cartTotal = 0;
    
    if (req.session.buyNowItem) {
      const buyNowItem = req.session.buyNowItem;
      const productData = await product.findById(buyNowItem.productId);
      
      if (productData) {
        let variantDoc = null;
        if (productData.VariantItem && productData.VariantItem.length > 0) {
          if (buyNowItem.variantId) {
            variantDoc = productData.VariantItem.find(
              v => v._id.toString() === buyNowItem.variantId.toString()
            );
          }
          if (!variantDoc && buyNowItem.variantMl) {
            variantDoc = productData.VariantItem.find(v => v.Ml === parseInt(buyNowItem.variantMl));
          }
        }
        
        const currentPrice = variantDoc ? (variantDoc.offerPrice || variantDoc.Price) : buyNowItem.price;
        cartTotal = currentPrice * (buyNowItem.quantity || 1);
      }
    } else {
      const cartData = await cart.findOne({ userId: userId })
        .populate("cart_items.packageProductId");
      
      if (cartData && cartData.cart_items && cartData.cart_items.length > 0) {
        cartData.cart_items.forEach(item => {
          const productDoc = item.packageProductId;
          if (!productDoc) return;
          
          let variantDoc = null;
          if (productDoc.VariantItem && productDoc.VariantItem.length > 0) {
            if (item.variantId) {
              variantDoc = productDoc.VariantItem.find(
                v => v._id.toString() === item.variantId.toString()
              );
            }
            if (!variantDoc && item.variantMl) {
              variantDoc = productDoc.VariantItem.find(v => v.Ml === parseInt(item.variantMl));
            }
          }
          
          const currentPrice = variantDoc ? (variantDoc.offerPrice || variantDoc.Price) : (item.price || 0);
          cartTotal += currentPrice * item.quantity;
        });
      }
    }

    if (cartTotal < coupon.minCartValue) {
      return res.status(400).json({
        success: false,
        message: `Minimum cart value ₹${coupon.minCartValue} required for this coupon. Your cart total is ₹${cartTotal.toFixed(2)}.`
      });
    }

    const discount = Math.min(coupon.discountValue, cartTotal);
    
    req.session.appliedCoupon = {
      code: coupon.code,
      discountValue: coupon.discountValue,
      minCartValue: coupon.minCartValue,
      description: coupon.description || `Save ₹${coupon.discountValue}`,
      couponId: coupon._id
    };

    return res.json({
      success: true,
      message: "Coupon applied successfully",
      coupon: {
        code: coupon.code,
        discountValue: coupon.discountValue,
        minCartValue: coupon.minCartValue,
        description: coupon.description
      },
      discount: discount,
      cartTotal: cartTotal,
      finalAmount: cartTotal - discount
    });

  } catch (err) {
    console.error("Apply Coupon Error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Server error while applying coupon" 
    });
  }
};

const removeCoupon = async (req, res) => {
  try {
    if (req.session.appliedCoupon) {
      delete req.session.appliedCoupon;
      return res.json({
        success: true,
        message: "Coupon removed successfully"
      });
    }
    return res.json({
      success: true,
      message: "No coupon to remove"
    });
  } catch (err) {
    console.error("Remove Coupon Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const placeOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    const { addressId, paymentMethod, couponCode: inputCouponCode } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Login first" });
    }
    if (!addressId) {
      return res.status(400).json({ success: false, message: "Select address" });
    }

    let cartItems = [];
    let isBuyNow = false;
    
    if (req.session.buyNowItem) {
      isBuyNow = true;
      const buyNowItem = req.session.buyNowItem;
      const productData = await product.findById(buyNowItem.productId);
      
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
      const userCart = await cart
        .findOne({ userId })
        .populate("cart_items.packageProductId");

      if (!userCart || !userCart.cart_items || userCart.cart_items.length === 0) {
        return res.status(400).json({ success: false, message: "Cart is empty" });
      }
      
      cartItems = userCart.cart_items;
    }

    let totalPrice = 0;
    let totalDiscount = 0;
    let hasOutOfStock = false;

    const orderedItem = cartItems
      .map((item) => {
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
      })
      .filter(Boolean);

    if (hasOutOfStock) {
      return res.status(400).json({
        success: false,
        message: "Some items in your cart are out of stock. Please review your cart.",
      });
    }

    const afterDiscount = totalPrice - totalDiscount;

    let couponDiscount = 0;
    let appliedCouponId = null;
    let couponCode = '';
    let couponDetails = null;

    let effectiveCouponCode = inputCouponCode || (req.session.appliedCoupon ? req.session.appliedCoupon.code : null);

    if (effectiveCouponCode) {
      const couponCheck = await checkCouponAvailability(userId, effectiveCouponCode);
      
      if (!couponCheck.available) {
        return res.status(400).json({
          success: false,
          message: couponCheck.reason || "Invalid coupon"
        });
      }

      const coupon = couponCheck.coupon;

      if (afterDiscount < coupon.minCartValue) {
        return res.status(400).json({
          success: false,
          message: `Minimum cart value ₹${coupon.minCartValue} required for this coupon. Your cart total is ₹${afterDiscount.toFixed(2)}`
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
    const totalAmount = afterCouponDiscount + deliveryCharge;

    if (paymentMethod === 'cod' && totalAmount > 1000) {
        return res.status(400).json({
          success: false,
          message: "Cash on Delivery is not available for orders above ₹1000."
        });
      }

    const userWallet = await wallet.findOne({ UserId: userId });
    const walletBalance = parseFloat(userWallet?.Balance) || 0;
    
    let walletUsed = 0;
    let finalAmount = totalAmount;
    let remainingWalletBalance = walletBalance;
    let actualPaymentMethod = '';
    let paymentStatus = 'Pending';
    let orderStatus = 'Pending';
    
    if (paymentMethod === 'wallet') {
      if (walletBalance < totalAmount) {
        return res.status(400).json({
          success: false,
          message: `Insufficient wallet balance. Required: ₹${totalAmount.toFixed(2)}, Available: ₹${walletBalance.toFixed(2)}. Please add ₹${(totalAmount - walletBalance).toFixed(2)} to your wallet or choose another payment method.`
        });
      }
      
      walletUsed = totalAmount;
      finalAmount = totalAmount;
      remainingWalletBalance = walletBalance - walletUsed;
      actualPaymentMethod = 'Wallet';
      paymentStatus = 'Paid';
      orderStatus = 'Pending';
      
    } else if (paymentMethod === 'cod') {
      walletUsed = 0;
      finalAmount = totalAmount;
      remainingWalletBalance = walletBalance;
      actualPaymentMethod = 'Cod';
      paymentStatus = 'Pending';
      orderStatus = 'Pending';
      
    } else if (paymentMethod === 'razorpay') {
      walletUsed = 0;
      finalAmount = totalAmount;
      remainingWalletBalance = walletBalance;
      actualPaymentMethod = 'Razorpay';
      paymentStatus = 'Pending';
      orderStatus = 'Pending';
      
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method"
      });
    }

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
            message: `Insufficient stock for ${productDoc.productName} (${variantDoc.Ml} ml). Available: ${variantDoc.Quantity}, Requested: ${cartItem.quantity}`,
          });
        }
      }
    }

    const addressData = await address.findById(addressId);
    if (!addressData) {
      return res.status(400).json({ success: false, message: "Invalid address" });
    }

    orderedItem.forEach(item => {
      item.status = orderStatus;
      item.paymentStatus = paymentStatus;
    });

    const newOrder = new order({
      userId,
      address: addressId,
      payment: actualPaymentMethod,
      paymentStatus: paymentStatus,
      orderedItem,
      totalPrice: totalPrice,
      discount: totalDiscount,
      couponId: appliedCouponId,
      couponCode: couponCode || null,
      couponDiscount: couponDiscount,
      couponUsed: couponCode ? true : false,
      walletUsed: walletUsed,
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
      orderStatus: orderStatus,
    });

    await newOrder.save();

    if (appliedCouponId) {
      await Coupons.findByIdAndUpdate(appliedCouponId, {
        $push: {
          usedBy: {
            userId: userId,
            orderId: newOrder._id, 
            usedAt: new Date()
          }
        },
        $inc: { totalUsage: 1 }
      });
    }

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

        if (variantDoc) {
          variantDoc.Quantity -= cartItem.quantity;
        }
      } else {
        const stock = productDoc.stock || 0;
        productDoc.stock = stock - cartItem.quantity;
      }

      await productDoc.save();
    }

    if (walletUsed > 0) {
      let walletDoc = await wallet.findOne({ UserId: userId });

      if (!walletDoc) {
        walletDoc = new wallet({
          UserId: userId,
          Balance: "0",
          Wallet_transaction: []
        });
      }

      walletDoc.Balance = remainingWalletBalance.toFixed(2).toString();
      
      walletDoc.Wallet_transaction.push({
        Amount: walletUsed.toFixed(2).toString(),
        Type: "debit",
        CreatedAt: new Date(),
        Description: `Payment for Order #${newOrder._id}`
      });

      await walletDoc.save();
    }

    if (isBuyNow) {
      delete req.session.buyNowItem;
    } else {
      const userCart = await cart.findOne({ userId });
      if (userCart) {
        userCart.cart_items = [];
        await userCart.save();
      }
    }

    delete req.session.appliedCoupon;

    return res.json({
      success: true,
      message: paymentMethod === 'wallet' ? 
        "Order placed and paid successfully via wallet" : 
        paymentMethod === 'cod' ?
        "Order placed successfully via COD" :
        "Order placed successfully. Please complete payment.",
      orderId: newOrder._id,
      totalPrice: totalPrice,
      discount: totalDiscount,
      couponDiscount: couponDiscount,
      couponCode: couponCode,
      shipping: deliveryCharge,
      walletUsed: walletUsed,
      finalAmount: finalAmount,
      paymentMethod: actualPaymentMethod,
      orderStatus: orderStatus,
      walletBalanceRemaining: remainingWalletBalance
    });
    
  } catch (error) {
    console.log("Order Error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to place order. Please try again." 
    });
  }
};

const getAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const id = req.params.id;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Please login first",
      });
    }

    const addressData = await address.findOne({ _id: id, userId });

    if (!addressData) {
      return res.status(400).json({
        success: false,
        message: "Address not found",
      });
    }

    return res.json({
      success: true,
      address: {
        _id: addressData._id,
        fullName: addressData.name,
        phone: addressData.phone,
        addressLine1: addressData.flatNumber,
        addressLine2: addressData.streetName,
        landmark: addressData.landMark,
        city: addressData.city,
        state: addressData.state,
        pincode: addressData.pincode,
        country: addressData.country,
        addressType: addressData.addressType,
      },
    });
  } catch (error) {
    console.error("Error fetching address:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch address",
    });
  }
};

const addAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Please login first",
      });
    }

    const {
      fullName,
      phone,
      addressLine1,
      addressLine2,
      landmark,
      city,
      state,
      pincode,
      country,
      addressType,
    } = req.body;

    if (
      !fullName ||
      !phone ||
      !addressLine1 ||
      !city ||
      !state ||
      !pincode ||
      !country
    ) {
      return res.status(400).json({
        success: false,
        message: "Please fill all required fields marked with *",
      });
    }

    if (!nameRegex.test(fullName.trim())) {
      return res.status(400).json({
        success: false,
        message:
          "Full name must be 6-30 letters only (spaces allowed, no numbers or special characters)",
      });
    }

    if (!phoneRegex.test(phone.trim())) {
      return res.status(400).json({
        success: false,
        message:
          "Phone number must be a valid 10-digit Indian number starting with 6-9",
      });
    }

    if (!pincodeRegex.test(pincode.trim())) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 6-digit pincode",
      });
    }

    if (addressLine1.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: "Address must be at least 5 characters",
      });
    }

    if (city.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid city name",
      });
    }

    if (state.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid state name",
      });
    }

    const addressCount = await address.countDocuments({ userId });
    if (addressCount >= 5) {
      return res.status(400).json({
        success: false,
        message: "You can only save up to 5 addresses",
      });
    }

    const newAddress = new address({
      userId,
      name: fullName.trim(),
      phone: phone.trim(),
      flatNumber: addressLine1.trim(),
      streetName: addressLine2 ? addressLine2.trim() : "",
      landMark: landmark ? landmark.trim() : "",
      city: city.trim(),
      state: state.trim(),
      pincode: pincode.trim(),
      country: country.trim() || "India",
      addressType: addressType ? addressType.toLowerCase() : "home",
    });

    await newAddress.save();

    res.json({
      success: true,
      message: "Address added successfully",
      address: newAddress,
    });
  } catch (error) {
    console.error("Error adding address:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add address. Please try again.",
    });
  }
};

const editAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const id = req.params.id;
    const {
      fullName,
      phone,
      addressLine1,
      addressLine2,
      landmark,
      city,
      state,
      pincode,
      country,
      addressType,
    } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Please login first",
      });
    }

    const addressData = await address.findOne({ _id: id, userId });

    if (!addressData) {
      return res.status(404).json({
        success: false,
        message: "Address not found or unauthorized",
      });
    }

    if (
      !fullName ||
      !phone ||
      !addressLine1 ||
      !city ||
      !state ||
      !pincode ||
      !country
    ) {
      return res.status(400).json({
        success: false,
        message: "Please fill all required fields marked with *",
      });
    }

    if (!nameRegex.test(fullName.trim())) {
      return res.status(400).json({
        success: false,
        message:
          "Full name must be 6-30 letters only (spaces allowed, no numbers or special characters)",
      });
    }

    if (!phoneRegex.test(phone.trim())) {
      return res.status(400).json({
        success: false,
        message:
          "Phone number must be a valid 10-digit Indian number starting with 6-9",
      });
    }

    if (!pincodeRegex.test(pincode.trim())) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 6-digit pincode",
      });
    }

    if (addressLine1.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: "Address must be at least 5 characters",
      });
    }

    if (city.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid city name",
      });
    }

    if (state.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid state name",
      });
    }

    const updatedAddress = await address.findByIdAndUpdate(
      id,
      {
        name: fullName.trim(),
        phone: phone.trim(),
        flatNumber: addressLine1.trim(),
        streetName: addressLine2 ? addressLine2.trim() : "",
        landmark: landmark ? landmark.trim() : "",
        city: city.trim(),
        state: state.trim(),
        pincode: pincode.trim(),
        country: country.trim() || "India",
        addressType: addressType ? addressType.toLowerCase() : "home",
      },
      { new: true, runValidators: true }
    );

    return res.json({
      success: true,
      message: "Address updated successfully",
      address: updatedAddress,
    });
  } catch (error) {
    console.error("Error updating address:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update address. Please try again.",
    });
  }
};

const deleteAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const id = req.params.id;
    if (!userId) {
      return res.redirect("/login");
    }

    const deleteAddress = await address.findByIdAndDelete({ _id: id, userId });

    if (!deleteAddress) {
      return res.status(400).json({
        success: false,
        message: "invalid address",
      });
    }

    return res.status(200).json({
      success: true,
      message: "delete address successfully",
    });
  } catch (error) {
    console.error("Order success page error:", error);
    res.status(500).render("error", { message: "Server error" });
  }
};

const orderSuccess = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.user;

    if (!userId) {
      return res.redirect("/login");
    }

    const orderExists = await order.findById(orderId);

    if (!orderExists) {
      return res.status(404).render("error", { message: "Order not found" });
    }

    res.render("user/orderSuccesPage", {
      orderId: orderId,
    });
  } catch (error) {
    console.error("Order success page error:", error);
    res.status(500).render("error", { message: "Server error" });
  }
};

export default {
  getCheckout,
  placeOrder,
  orderSuccess,
  getAddress,
  addAddress,
  editAddress,
  deleteAddress,
  applyCoupon,
  removeCoupon
};