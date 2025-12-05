import user from "../../model/userSchema.js";
import product from "../../model/productSchema.js";
import cart from "../../model/cartSchema.js";

const getCart = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.redirect("/login");
    }

    if (req.session.buyNowItem) {
      delete req.session.buyNowItem;
    }

    const userData = await user.findById(userId);

    const cartData = await cart.findOne({ userId: userId }).populate({
      path: "cart_items.packageProductId",
      model: "Product",
    });

    if (!cartData) {
      return res.render("user/cartPage", {
        user: userData,
        cartItems: [],
        totalCartPrice: 0,
      });
    }

    const safeCartItems = (cartData.cart_items || [])
      .map((item) => {
        const productData = item.packageProductId;

        if (!productData) {
          return {
            ...item.toObject(),
            packageProductId: null,
            isInvalid: true,
          };
        }

        const variantData = productData.VariantItem?.find(
          (v) => v._id.toString() === item.variantId.toString()
        );

        return {
          ...item.toObject(),
          variantData: variantData || null,
        };
      })
      .filter((item) => !item.isInvalid);

    let totalCartPrice = 0;
    if (safeCartItems.length > 0) {
      totalCartPrice = safeCartItems.reduce((total, item) => {
        return total + (parseFloat(item.totalPrice) || 0);
      }, 0);
    }

    return res.render("user/cartPage", {
      user: userData,
      cartItems: safeCartItems,
      totalCartPrice: totalCartPrice,
    });
  } catch (error) {
    console.log("Error in getCart:", error);
    return res.status(500).render("error", { message: "Server Error" });
  }
};

const addCart = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.redirect("/login");
    }

    const productId = req.params.id;
    const body = req.body || {};

    let quantity = 1;
    let variantMl = body.variantMl || null;

    if (body.quantity !== undefined) {
      quantity = parseInt(body.quantity);
    }

    if (isNaN(quantity) || quantity < 1) {
      quantity = 1;
    }

    if (quantity > 10) {
      return res.status(400).json({
        success: false,
        message: "Maximum quantity per item is 10",
      });
    }

    const productData = await product.findById(productId);
    if (!productData) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    if (productData.status !== "active" && productData.isListed !== true) {
      return res.status(400).json({
        success: false,
        message: "Product is not available",
      });
    }

    let selectedVariant = null;

    if (variantMl) {
      selectedVariant = productData.VariantItem?.find(
        (v) => v.Ml === parseInt(variantMl) && v.Quantity > 0
      );
    }

    if (!selectedVariant) {
      selectedVariant = productData.VariantItem?.find((v) => v.Quantity > 0);
    }

    if (!selectedVariant) {
      return res.status(400).json({
        success: false,
        message: "No variants available in stock",
      });
    }

    if (selectedVariant.Quantity < quantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${selectedVariant.Quantity} items available for ${selectedVariant.Ml}ml variant`,
      });
    }

    const productPrice = productData.price;

    const totalPrice = productPrice * quantity;

    let userCart = await cart.findOne({ userId: userId });

    if (!userCart) {
      userCart = new cart({
        userId: userId,
        cart_items: [],
      });
    }

    userCart.cart_items = userCart.cart_items.filter((item) => {
      return (
        item.packageProductId &&
        item.packageProductId.toString() &&
        item.packageProductId.toString().length > 0 &&
        item.variantId &&
        item.variantId.toString().length > 0
      );
    });

    const existingItemIndex = userCart.cart_items.findIndex(
      (item) =>
        item.packageProductId &&
        item.packageProductId.toString() === productId &&
        item.variantId &&
        item.variantId.toString() === selectedVariant._id.toString()
    );

    if (existingItemIndex !== -1) {
      const existingItem = userCart.cart_items[existingItemIndex];
      const newQuantity = existingItem.quantity + quantity;

      if (selectedVariant.Quantity < newQuantity) {
        return res.status(400).json({
          success: false,
          message: `Cannot add more items. Only ${selectedVariant.Quantity} available for ${selectedVariant.Ml}ml variant. You already have ${existingItem.quantity} in cart.`,
        });
      }

      if (newQuantity > 10) {
        return res.status(400).json({
          success: false,
          message: `Maximum quantity limit (10) reached for this product`,
        });
      }

      const newTotalPrice = productPrice * newQuantity;

      userCart.cart_items[existingItemIndex].quantity = newQuantity;
      userCart.cart_items[existingItemIndex].totalPrice = newTotalPrice;
      userCart.cart_items[existingItemIndex].addedAt = new Date();
    } else {
      const mongoose = await import("mongoose");
      const productObjectId = new mongoose.default.Types.ObjectId(productId);
      const variantObjectId = new mongoose.default.Types.ObjectId(
        selectedVariant._id
      );

      userCart.cart_items.push({
        packageProductId: productObjectId,
        variantId: variantObjectId,
        variantName: `${selectedVariant.Ml}ml`,
        variantMl: selectedVariant.Ml,
        price: productPrice,
        quantity: quantity,
        totalPrice: totalPrice,
        addedAt: new Date(),
      });
    }

    await userCart.save();

    const updatedCart = await cart.findOne({ userId: userId });
    const cartCount = updatedCart ? updatedCart.cart_items.length : 0;

    if (req.xhr || req.headers.accept.indexOf("json") > -1) {
      return res.json({
        success: true,
        message: `${quantity} product(s) (${selectedVariant.Ml}ml) added to cart successfully`,
        cartCount: cartCount,
        productName: productData.productName || productData.name,
      });
    } else {
      return res.redirect("/cart");
    }
  } catch (error) {
    return res.json({ success: false, message: "Server error" });
  }
};

const removeFromCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const itemId = req.params.id;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Login required" });
    }

    const userCart = await cart.findOne({ userId });
    if (!userCart) {
      return res
        .status(404)
        .json({ success: false, message: "Cart not found" });
    }

    userCart.cart_items = userCart.cart_items.filter(
      (item) => item._id.toString() !== itemId
    );

    await userCart.save();

    return res.json({
      success: true,
      message: "Item removed",
      cartCount: userCart.cart_items.length,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const updateQuantity = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.redirect("/login");
    }
    const { itemId, action } = req.body;

    const cartData = await cart
      .findOne({ userId })
      .populate("cart_items.packageProductId");

    if (!cartData) {
      return res.json({ success: false, message: "Cart not found" });
    }

    const item = cartData.cart_items.id(itemId);
    if (!item) {
      return res.json({ success: false, message: "Item not found" });
    }

    const product = item.packageProductId;
    const variant = product?.VariantItem?.find(
      (v) => v._id.toString() === item.variantId.toString()
    );

    const stock = variant?.Quantity || product?.stock || 0;

    if (action === "increment") {
      if (item.quantity >= stock) {
        return res.json({ success: false, message: "Stock limit reached" });
      }

      if (item.quantity >= 10) {
        return res.json({
          success: false,
          message: "Max quantity allowed is 10",
        });
      }

      item.quantity += 1;
    }

    if (action === "decrement") {
      if (item.quantity <= 1) {
        return res.json({ success: false, message: "Minimum quantity is 1" });
      }

      item.quantity -= 1;
    }

    item.totalPrice = item.quantity * item.price;

    await cartData.save();

    const subtotal = cartData.cart_items.reduce(
      (sum, item) => sum + item.totalPrice,
      0
    );

    const shipping = subtotal > 1000 ? 0 : 0;
    const total = subtotal + shipping;

    return res.json({
      success: true,
      item: {
        id: itemId,
        quantity: item.quantity,
        totalPrice: item.totalPrice,
      },
      totals: {
        subtotal,
        shipping,
        total,
      },
    });
  } catch (error) {
    return res.json({ success: false, message: "Server error" });
  }
};

const buyNow = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.json({
        success: false,
        redirect: "/login",
      });
    }

    const productId = req.params.id;
    const { quantity, variantMl } = req.body;

    const productData = await product.findById(productId);
    if (!productData) {
      return res.json({
        success: false,
        message: "Product not found",
      });
    }

    let selectedVariant = productData.VariantItem.find(
      (v) => v.Ml === parseInt(variantMl)
    );

    if (!selectedVariant || selectedVariant.Quantity <= 0) {
      return res.json({
        success: false,
        message: "Selected variant out of stock",
      });
    }

    if (quantity > selectedVariant.Quantity) {
      return res.json({
        success: false,
        message: `Only ${selectedVariant.Quantity} pieces available`,
      });
    }

    req.session.buyNowItem = {
      productId,
      variantId: selectedVariant._id,
      variantMl: selectedVariant.Ml,
      price: productData.price,
      quantity,
      totalPrice: productData.price * quantity,
    };

    return res.json({
      success: true,
      message: "Proceed to checkout",
    });
  } catch (error) {
    console.log("Buy Now error:", error);
    return res.json({ success: false, message: "Server error" });
  }
};

export default {
  getCart,
  addCart,
  removeFromCart,
  updateQuantity,
  buyNow,
};
