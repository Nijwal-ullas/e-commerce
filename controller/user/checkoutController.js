import user from "../../model/userSchema.js";
import cart from "../../model/cartSchema.js";
import address from "../../model/addressSchema.js";
import order from "../../model/orderSchema.js";
import product from "../../model/productSchema.js";

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
    const cartData = await cart
      .findOne({ userId: userId })
      .populate("cart_items.packageProductId");

    if (!cartData || !cartData.cart_items || cartData.cart_items.length === 0) {
      return res.redirect("/cart");
    }

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
      cart: cartData,
      cartItems: cartData.cart_items || [],
      addresses: userAddress,
      page,
      totalPage,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).send("Server Error");
  }
};

const placeOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    const { addressId } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Login first" });
    }
    if (!addressId) {
      return res
        .status(400)
        .json({ success: false, message: "Select address" });
    }

    const userCart = await cart
      .findOne({ userId })
      .populate("cart_items.packageProductId");

    if (!userCart || !userCart.cart_items || userCart.cart_items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    let subtotal = 0;
    let discount = 0;

    const orderedItem = userCart.cart_items
      .map((item) => {
        const productDoc = item.packageProductId;
        if (!productDoc) return null;

        const original = productDoc.price || 0;
        const offerPrice = productDoc.offerPrice || original;
        const finalPrice = offerPrice;

        subtotal += original * item.quantity;
        discount += (original - finalPrice) * item.quantity;

        let variantId = item.variantId || null;
        let mlValue = null;

        if (productDoc.VariantItem && productDoc.VariantItem.length > 0) {
          if (item.Ml !== undefined && item.Ml !== null) {
            mlValue = Number(item.Ml);
          } else if (item.ml !== undefined && item.ml !== null) {
            mlValue = Number(item.ml);
          }

          let variantDoc = null;

          if (variantId) {
            variantDoc =
              productDoc.VariantItem.id(variantId) ||
              productDoc.VariantItem.find(
                (v) => v._id.toString() === variantId.toString()
              );
          }

          if (!variantDoc && mlValue != null) {
            variantDoc = productDoc.VariantItem.find((v) => v.Ml === mlValue);
          }

          if (variantDoc) {
            variantId = variantDoc._id;
            if (mlValue == null) mlValue = variantDoc.Ml;
          }
        }

        return {
          productId: productDoc._id,
          price: finalPrice,
          quantity: item.quantity,
          status: "Pending",
          ml: mlValue, 
          variantId: variantId || null,
        };
      })
      .filter(Boolean);

    const afterDiscount = subtotal - discount;
    const deliveryCharge = afterDiscount > 500 ? 0 : 50;
    const finalAmount = afterDiscount + deliveryCharge;

  
    for (const cartItem of userCart.cart_items) {
      const productDoc = cartItem.packageProductId;
      if (!productDoc) continue;

      if (productDoc.VariantItem && productDoc.VariantItem.length > 0) {
        let mlValue = null;
        if (cartItem.Ml !== undefined && cartItem.Ml !== null) {
          mlValue = Number(cartItem.Ml);
        } else if (cartItem.ml !== undefined && cartItem.ml !== null) {
          mlValue = Number(cartItem.ml);
        }

        let variantDoc = null;

        if (cartItem.variantId) {
          variantDoc =
            productDoc.VariantItem.id(cartItem.variantId) ||
            productDoc.VariantItem.find(
              (v) => v._id.toString() === cartItem.variantId.toString()
            );
        }

        if (!variantDoc && mlValue != null) {
          variantDoc = productDoc.VariantItem.find((v) => v.Ml === mlValue);
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

        variantDoc.Quantity -= cartItem.quantity;
      } else {
        if ((productDoc.stock || 0) < cartItem.quantity) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${
              productDoc.productName
            }. Available: ${productDoc.stock || 0}, Requested: ${
              cartItem.quantity
            }`,
          });
        }
        productDoc.stock = (productDoc.stock || 0) - cartItem.quantity;
      }

      await productDoc.save();
    }

    
    const addressData = await address.findById(addressId);
    if (!addressData) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid address" });
    }

    const newOrder = new order({
      userId,
      address: addressId,
      payment: "Cod",
      paymentStatus: "Pending",
      orderedItem,
      totalPrice: finalAmount,
      discount,
      finalAmount,
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

    userCart.cart_items = [];
    await userCart.save();

    return res.json({
      success: true,
      message: "Order placed",
      orderId: newOrder._id,
    });
  } catch (error) {
    console.log("Order Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to place order" });
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
      !landmark ||
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
      landMark: landmark.trim(),
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
      !landmark ||
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
        landmark: landmark.trim(),
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
};
