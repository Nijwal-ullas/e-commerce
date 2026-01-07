import user from "../../model/userSchema.js";
import product from "../../model/productSchema.js";
import cart from "../../model/cartSchema.js";
import statusCode from "../../utilities/statusCodes.js";
import errorMessage from "../../utilities/errorMessages.js";

const getCart = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect("/login");

    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    if (req.session.buyNowItem) delete req.session.buyNowItem;

    const userData = await user.findById(userId);

    const cartData = await cart.findOne({ userId }).populate({
      path: "cart_items.packageProductId",
      model: "Product",
    });

    if (!cartData || cartData.cart_items.length === 0) {
      return res.render("user/cartPage", {
        user: userData,
        cartItems: [],
        page: 1,
        totalPage: 1,
      });
    }

    let hasChanges = false;
    const validItems = [];

    for (const item of cartData.cart_items) {
      const productData = item.packageProductId;

      if (!productData || productData.isListed !== true) {
        hasChanges = true;
        continue;
      }

      const variantData = productData?.VariantItem?.find(
        (v) => v._id.toString() === item.variantId?.toString()
      );

      if (!variantData) {
        hasChanges = true;
        continue;
      }

      const stock = variantData?.Quantity || 0;
      if (item.quantity > stock) {
        if (stock === 0) {
        } else {
          item.quantity = Math.min(item.quantity, stock);
          item.totalPrice =
            item.quantity *
            (variantData.offerPrice || variantData.Price || item.price);
          hasChanges = true;
        }
      }

      validItems.push(item);
    }

    if (hasChanges) {
      cartData.cart_items = validItems;
      await cartData.save();
    }

    const totalItems = validItems.length;
    const totalPage = Math.ceil(totalItems / limit);
    const paginatedItems = validItems.slice(skip, skip + limit);

    const cartItems = paginatedItems.map((item) => {
      const productData = item.packageProductId;
      const variantData = productData?.VariantItem?.find(
        (v) => v._id.toString() === item.variantId.toString()
      );

      const isProductMissing = !productData;
      const isBlocked = productData?.isListed === false;
      const stock = variantData?.Quantity ?? 0;

      const exceedsStock = stock > 0 && item.quantity > stock;
      const isOutOfStock = stock === 0;

      const displayPrice =
        variantData?.offerPrice || variantData?.Price || item.price;
      const originalPrice = variantData?.Price || item.price;

      return {
        ...item.toObject(),
        productData,
        variantData,
        isProductMissing,
        isBlocked,
        stock,
        exceedsStock,
        isOutOfStock,
        displayPrice,
        originalPrice,
        hasDiscount:
          variantData?.offerPrice &&
          variantData?.Price > variantData?.offerPrice,
        discountPercentage:
          variantData?.offerPrice && variantData?.Price
            ? Math.round(
                ((variantData.Price - variantData.offerPrice) /
                  variantData.Price) *
                  100
              )
            : 0,
      };
    });

    return res.render("user/cartPage", {
      user: userData,
      cartItems,
      page,
      totalPage,
    });
  } catch (error) {
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

const addCart = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(statusCode.UNAUTHORIZED).json({
        success: false,
        message: "Please login to add items to cart",
        redirect: "/login",
      });
    }

    const productId = req.params.id;
    const body = req.body || {};

    let quantity = 1;
    let variantMl = body.variantMl || null;
    let variantId = body.variantId || null;

    if (body.quantity !== undefined) {
      quantity = parseInt(body.quantity);
    }

    if (isNaN(quantity) || quantity < 1) {
      quantity = 1;
    }

    if (quantity > 10) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "Maximum quantity per item is 10",
      });
    }

    const productData = await product.findById(productId);
    if (!productData || productData.isListed !== true) {
      return res.status(statusCode.FORBIDDEN).json({
        success: false,
        message: "Product is blocked by admin",
      });
    }

    let selectedVariant = null;

    if (variantId) {
      selectedVariant = productData.VariantItem?.find(
        (v) => v._id.toString() === variantId.toString()
      );
    }

    if (!selectedVariant && variantMl) {
      selectedVariant = productData.VariantItem?.find(
        (v) => v.Ml === parseInt(variantMl)
      );
    }

    if (!selectedVariant) {
      selectedVariant = productData.VariantItem?.find((v) => v.Quantity > 0);
    }

    if (!selectedVariant) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "No variants available in stock",
      });
    }

    if (selectedVariant.Quantity < quantity) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: `Only ${selectedVariant.Quantity} items available for ${selectedVariant.Ml}ml variant`,
      });
    }

    const productPrice = selectedVariant.offerPrice;
    const originalPrice = selectedVariant.Price;

    const totalPrice = productPrice * quantity;
    const originalTotalPrice = originalPrice * quantity;

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
        return res.status(statusCode.BAD_REQUEST).json({
          success: false,
          message: `Cannot add more items. Only ${selectedVariant.Quantity} available for ${selectedVariant.Ml}ml variant. You already have ${existingItem.quantity} in cart.`,
        });
      }

      if (newQuantity > 10) {
        return res.status(statusCode.BAD_REQUEST).json({
          success: false,
          message: `Maximum quantity limit (10) reached for this product`,
        });
      }

      const newTotalPrice = productPrice * newQuantity;

      userCart.cart_items[existingItemIndex].quantity = newQuantity;
      userCart.cart_items[existingItemIndex].price = productPrice;
      userCart.cart_items[existingItemIndex].originalPrice = originalPrice;
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
        oldPrice: originalPrice,
        price: productPrice,
        originalPrice: originalPrice,
        quantity: quantity,
        totalPrice: totalPrice,
        addedAt: new Date(),
      });
    }

    await userCart.save();

    const updatedCart = await cart.findOne({ userId: userId });
    const cartCount = updatedCart ? updatedCart.cart_items.length : 0;

    let cartTotal = 0;
    if (updatedCart && updatedCart.cart_items.length > 0) {
      cartTotal = updatedCart.cart_items.reduce((total, item) => {
        return total + (parseFloat(item.totalPrice) || 0);
      }, 0);
    }

    return res.json({
      success: true,
      message: `${quantity} product(s) (${selectedVariant.Ml}ml) added to cart successfully`,
      cartCount: cartCount,
      cartTotal: cartTotal,
      productName: productData.productName || productData.name,
    });
  } catch (error) {
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

const removeFromCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const itemId = req.params.id;

    if (!userId) {
      return res.status(statusCode.UNAUTHORIZED).json({
        success: false,
        message: "Login required",
        redirect: "/login",
      });
    }

    const userCart = await cart.findOne({ userId });
    if (!userCart) {
      return res.status(statusCode.NOT_FOUND).json({
        success: false,
        message: "Cart not found",
      });
    }

    const itemToRemove = userCart.cart_items.find(
      (item) => item._id.toString() === itemId
    );

    userCart.cart_items = userCart.cart_items.filter(
      (item) => item._id.toString() !== itemId
    );

    await userCart.save();

    let cartTotal = 0;
    if (userCart.cart_items.length > 0) {
      cartTotal = userCart.cart_items.reduce((total, item) => {
        return total + (parseFloat(item.totalPrice) || 0);
      }, 0);
    }

    return res.json({
      success: true,
      message: "Item removed from cart",
      cartCount: userCart.cart_items.length,
      cartTotal: cartTotal,
      removedItemPrice: itemToRemove?.totalPrice || 0,
    });
  } catch (error) {
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

const updateQuantity = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(statusCode.UNAUTHORIZED).json({
        success: false,
        message: "Login required",
        redirect: "/login",
      });
    }

    const { itemId, action } = req.body;

    const cartData = await cart
      .findOne({ userId })
      .populate("cart_items.packageProductId");

    if (!cartData) {
      return res.status(statusCode.NOT_FOUND).json({
        success: false,
        message: "Cart not found",
      });
    }

    const item = cartData.cart_items.id(itemId);
    if (!item) {
      return res.status(statusCode.NOT_FOUND).json({
        success: false,
        message: "Item not found in cart",
      });
    }

    const product = item.packageProductId;

    if (!product) {
      cartData.cart_items = cartData.cart_items.filter(
        (item) => item._id.toString() !== itemId
      );
      await cartData.save();

      return res.status(statusCode.NOT_FOUND).json({
        success: false,
        message: "Product not found, item removed from cart",
      });
    }

    if (product.isListed !== true) {
      return res.status(statusCode.FORBIDDEN).json({
        success: false,
        message: "Product is blocked by admin",
      });
    }

    const variant = product?.VariantItem?.find(
      (v) => v._id.toString() === item.variantId.toString()
    );

    if (!variant) {
      cartData.cart_items = cartData.cart_items.filter(
        (item) => item._id.toString() !== itemId
      );
      await cartData.save();

      return res.status(statusCode.NOT_FOUND).json({
        success: false,
        message: "Variant not found, item removed from cart",
      });
    }

    const stock = variant?.Quantity || 0;

    if (stock === 0) {
      if (action === "increment") {
        return res.json({
          success: false,
          message: "Product is out of stock",
          allowDecreaseOnly: true,
        });
      } else if (action === "decrement") {
        if (item.quantity <= 1) {
          return res.json({
            success: false,
            message: "Minimum quantity is 1",
          });
        }
        item.quantity -= 1;
      }
    } else {
      if (action === "increment") {
        if (item.quantity >= stock) {
          return res.json({
            success: false,
            message: `Only ${stock} items available in stock`,
            stockAvailable: stock,
          });
        }

        if (item.quantity >= 10) {
          return res.json({
            success: false,
            message: "Maximum quantity allowed is 10",
          });
        }

        item.quantity += 1;
      } else if (action === "decrement") {
        if (item.quantity <= 1) {
          return res.json({
            success: false,
            message: "Minimum quantity is 1",
          });
        }

        item.quantity -= 1;
      } else {
        return res.json({
          success: false,
          message: "Invalid action",
        });
      }
    }

    const currentPrice = variant.offerPrice || variant.Price || item.price;
    item.price = currentPrice;
    item.totalPrice = item.quantity * currentPrice;

    await cartData.save();

    const subtotal = cartData.cart_items.reduce(
      (sum, item) => sum + item.totalPrice,
      0
    );

    const shipping = subtotal > 500 ? 0 : 50;
    const total = subtotal + shipping;

    return res.status(statusCode.OK).json({
      success: true,
      item: {
        id: itemId,
        quantity: item.quantity,
        price: item.price,
        totalPrice: item.totalPrice,
      },
      totals: {
        subtotal,
        shipping,
        total,
      },
      cartCount: cartData.cart_items.length,
    });
  } catch (error) {
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

const buyNow = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Please login to proceed",
        redirect: "/login",
      });
    }

    const productId = req.params.id;
    const { quantity, variantMl, variantId } = req.body;

    const productData = await product.findById(productId);
    if (!productData || productData.isListed !== true) {
      return res.status(statusCode.FORBIDDEN).json({
        success: false,
        message: "Product is blocked by admin",
      });
    }

    let selectedVariant = null;

    if (variantId) {
      selectedVariant = productData.VariantItem.find(
        (v) => v._id.toString() === variantId.toString()
      );
    } else if (variantMl) {
      selectedVariant = productData.VariantItem.find(
        (v) => v.Ml === parseInt(variantMl)
      );
    }

    if (!selectedVariant) {
      selectedVariant = productData.VariantItem.find((v) => v.Quantity > 0);
    }

    if (!selectedVariant || selectedVariant.Quantity <= 0) {
      return res.json({
        success: false,
        message: "Selected variant out of stock",
      });
    }

    const qty = parseInt(quantity) || 1;

    if (qty > selectedVariant.Quantity) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: `Only ${selectedVariant.Quantity} pieces available`,
      });
    }

    const productPrice = selectedVariant.offerPrice;
    const originalPrice = selectedVariant.Price;

    req.session.buyNowItem = {
      productId,
      variantId: selectedVariant._id,
      variantMl: selectedVariant.Ml,
      oldPrice: originalPrice,
      price: productPrice,
      originalPrice: originalPrice,
      quantity: qty,
      totalPrice: productPrice * qty,
      originalTotalPrice: originalPrice * qty,
      productName: productData.productName || productData.name,
    };

    return res.status(statusCode.OK).json({
      success: true,
      message: "Proceed to checkout",
      redirect: "/checkout",
    });
  } catch (error) {
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

const checkOutValidate = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(statusCode.UNAUTHORIZED).json({
        success: false,
        message: "Please login to continue checkout",
      });
    }

    const cartData = await cart
      .findOne({ userId })
      .populate("cart_items.packageProductId");

    if (!cartData || cartData.cart_items.length === 0) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "no items in the cart",
      });
    }

    for (let items of cartData.cart_items) {
      const productDoc = items.packageProductId;

      if (!productDoc || productDoc.isListed !== true) {
        return res.status(statusCode.NOT_FOUND).json({
          success: false,
          message: "product is removed or blocked by admin",
        });
      }
      const variant = productDoc.VariantItem?.find(
        (v) => v._id.toString() === items.variantId.toString()
      );

      if (!variant) {
        return res.status(statusCode.BAD_REQUEST).json({
          success: false,
          message: "out of stock",
        });
      }

      if (variant.Quantity < items.quantity) {
        return res.status(statusCode.BAD_REQUEST).json({
          success: false,
          message: "this much quantity is not available ",
        });
      }
    }
    return res.json({
      success: true,
    });
  } catch (error) {
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

export default {
  getCart,
  addCart,
  removeFromCart,
  updateQuantity,
  buyNow,
  checkOutValidate,
};
