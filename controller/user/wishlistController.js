import wishlist from "../../model/wishlistSchema.js";
import product from "../../model/productSchema.js";

const isValidObjectId = (id) => {
  if (typeof id !== "string" && !(id instanceof String)) return false;
  return /^[0-9a-fA-F]{24}$/.test(id);
};

const getWishlist = async (req, res) => {
  try {
    const userId = req.session.user?._id || req.session.user;
    if (!userId) return res.redirect("/login");

    const page = parseInt(req.query.page) || 1;
    const limit = 12;
    const skip = (page - 1) * limit;

    const userWishlist = await wishlist.findOne({ userId }).populate({
      path: "products.productId",
      select:
        "productName price oldPrice images brand category VariantItem isListed",
    });

    let wishlistItems = [];
    let totalItems = 0;

    if (userWishlist && userWishlist.products) {
      const validItems = userWishlist.products.filter((item) => {
        if (!item.productId) return false;
        if (item.productId.isListed === false) return false;
        return true;
      });

      totalItems = validItems.length;
      wishlistItems = validItems.slice(skip, skip + limit);
    }

    const totalPage = Math.ceil(totalItems / limit);

    return res.render("user/wishlistPage", {
      wishlistItems,
      page,
      totalPage,
      totalItems,
    });
  } catch (error) {
    console.error("Wishlist page error:", error);
    return res.status(500).send("Server Error");
  }
};


const addToWishlist = async (req, res) => {
  try {
    const userId = req.session.user;
    const { productId } = req.body;

    if (!userId) {
      return res.redirect("/login")
       
    }

    if (!productId) {
      return res
        .status(400)
        .json({ success: false, message: "Product ID is required" });
    }

    if (!isValidObjectId(productId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product ID" });
    }

    const productExists = await product.findById(productId);
    if (!productExists) {
      return res
        .status(400)
        .json({ success: false, message: "Product not found" });
    }

    if (productExists.isListed === false) {
      return res
        .status(400)
        .json({ success: false, message: "This product is not available" });
    }

    let userWishlist = await wishlist.findOne({ userId });
    if (!userWishlist) {
      userWishlist = new wishlist({
        userId,
        products: [{ productId, addedAt: new Date() }],
      });
    } else {
      const existingItem = userWishlist.products.find(
        (item) => item.productId.toString() === productId
      );
      if (existingItem) {
        return res
          .status(400)
          .json({ success: false, message: "Product already in wishlist" });
      }
      userWishlist.products.push({ productId, addedAt: new Date() });
    }

    await userWishlist.save();
    return res.json({
      success: true,
      message: "Added to wishlist successfully",
      wishlistCount: userWishlist.products.length,
    });
  } catch (error) {
    console.error("Add to wishlist error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to add to wishlist" });
  }
};


const removeFromWishlist = async (req, res) => {
  try {
    const userId = req.session.user;
    const { productId } = req.params;

    if (!userId) {
      return res.redirect("/login")
    }

    if (!isValidObjectId(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const userWishlist = await wishlist.findOne({ userId });

    if (!userWishlist) {
      return res.status(400).json({
        success: false,
        message: "Wishlist not found",
      });
    }

    const originalLength = userWishlist.products.length;

    userWishlist.products = userWishlist.products.filter(
      (item) => item.productId.toString() !== productId
    );

    if (userWishlist.products.length === originalLength) {
      return res.status(400).json({
        success: false,
        message: "Product not found in wishlist",
      });
    }

    await userWishlist.save();

    return res.json({
      success: true,
      message: "Removed from wishlist",
      wishlistCount: userWishlist.products.length,
    });
  } catch (error) {
    console.error("Remove from wishlist error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to remove from wishlist",
    });
  }
};

const clearWishlist = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.redirect("/login")
    }

    const userWishlist = await wishlist.findOne({ userId });

    if (!userWishlist) {
      return res.status(400).json({
        success: false,
        message: "Wishlist not found",
      });
    }

    userWishlist.products = [];
    await userWishlist.save();

    return res.json({
      success: true,
      message: "Wishlist cleared successfully",
    });
  } catch (error) {
    console.error("Clear wishlist error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to clear wishlist",
    });
  }
};


const checkWishlist = async (req, res) => {
  try {
    const userId = req.session.user;
    const { productId } = req.params;

    if (!userId) {
      return res.json({
        success: true,
        inWishlist: false,
      });
    }

    if (!isValidObjectId(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const userWishlist = await wishlist.findOne({ userId });

    if (!userWishlist) {
      return res.json({
        success: true,
        inWishlist: false,
      });
    }

    const inWishlist = userWishlist.products.some(
      (item) => item.productId.toString() === productId
    );

    return res.json({
      success: true,
      inWishlist,
    });
  } catch (error) {
    console.error("Check wishlist error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to check wishlist",
    });
  }
};



export default {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  clearWishlist,
  checkWishlist,
};
