import product from "../../model/productSchema.js";
import category from "../../model/categorySchema.js";
import brand from "../../model/brandSchema.js";
import user from "../../model/userSchema.js";

const productPage = async (req, res) => {
  try {
    let userData = null;
    let userWishlist = [];

    if (req.session.user) {
      userData = await user.findById(req.session.user._id);
      if (userData && userData.wishlist) {
        userWishlist = userData.wishlist.map((id) => id.toString());
      }
    } else {
      userWishlist = req.session.wishlist || [];
    }

    const brands = await brand.find();
    const categories = await category.find({ isListed: true });
    const products = await product.find({ isListed: true }).limit(12);

    res.render("user/product", {
      user: userData,
      brands,
      categories,
      products,
      userWishlist,
    });
  } catch (err) {
    console.error("Error loading product page:", err);
    res.status(500).send("Server Error");
  }
};

const getProducts = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 12), 100);
    const skip = (page - 1) * limit;

    let userWishlist = [];
    if (req.session.user) {
      const userData = await user.findById(req.session.user._id);
      if (userData && userData.wishlist) {
        userWishlist = userData.wishlist.map((id) => id.toString());
      }
    } else {
      userWishlist = req.session.wishlist || [];
    }

    const listedCategories = await category.find({ isListed: true });
    const listedCategoryIds = listedCategories.map((cat) => cat._id.toString());

    let filterQuery = {
      isListed: true,
      category: { $in: listedCategoryIds },
    };

    if (req.query.categories) {
      const categoryIds = req.query.categories
        .split(",")
        .filter((id) => id && id.trim() !== "");

      if (categoryIds.length > 0) {
        const validCategoryIds = categoryIds.filter((id) =>
          listedCategoryIds.includes(id)
        );

        if (validCategoryIds.length > 0) {
          filterQuery.category = { $in: validCategoryIds };
        } else {
          filterQuery.category = { $in: listedCategoryIds };
        }
      }
    }

    if (req.query.brands) {
      const brandIds = req.query.brands
        .split(",")
        .filter((id) => id && id.trim() !== "");
      if (brandIds.length > 0) {
        filterQuery.brand = { $in: brandIds };
      }
    }
    if (req.query.minPrice || req.query.maxPrice) {
      const minPrice = Math.max(0, parseFloat(req.query.minPrice) || 0);
      const maxPrice = Math.min(
        100000,
        parseFloat(req.query.maxPrice) || 100000
      );

      if (maxPrice >= minPrice) {
        filterQuery.price = { $gte: minPrice, $lte: maxPrice };
      }
    }
    if (req.query.search) {
      const searchTerm = req.query.search.trim();
      if (searchTerm.length > 0) {
        const limitedSearchTerm = searchTerm.substring(0, 100);
        const sanitizedSearchTerm = limitedSearchTerm.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );

        filterQuery.productName = {
          $regex: sanitizedSearchTerm,
          $options: "i",
        };
      }
    }

    if (req.query.size) {
      const size = parseInt(req.query.size);
      const validSizes = [30, 50, 75, 100, 200];
      if (!isNaN(size) && validSizes.includes(size)) {
        filterQuery["VariantItem.Ml"] = size;
      }
    }

    let sortQuery = { createdAt: -1 };
    if (req.query.sortBy) {
      const validSortOptions = {
        "price-low": { price: 1 },
        "price-high": { price: -1 },
        latest: { createdAt: -1 },
        name: { productName: 1 },
      };

      if (validSortOptions[req.query.sortBy]) {
        sortQuery = validSortOptions[req.query.sortBy];
      }
    }

    const products = await product
      .find(filterQuery)
      .populate("category", "name")
      .populate("brand", "name")
      .sort(sortQuery)
      .skip(skip)
      .limit(limit);

    const totalProducts = await product.countDocuments(filterQuery);
    const totalPages = Math.ceil(totalProducts / limit);

    const brands = await brand.find();

    res.json({
      success: true,
      products,
      categories: listedCategories,
      brands,
      userWishlist,
      currentPage: page,
      totalPages,
      totalProducts,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

const getProductDetails = async (req, res) => {
  try {
    const productId = req.params.id;

    if (
      !productId ||
      productId.length !== 24 ||
      !/^[0-9a-fA-F]{24}$/.test(productId)
    ) {
      return res.redirect("/product");
    }

    const productData = await product
      .findById(productId)
      .populate("brand")
      .populate("category");

    if (!productData) {
      return res.redirect("/product");
    }

    let userData = null;
    let userWishlist = [];

    if (req.session.user) {
      userData = await user.findById(req.session.user._id);
      if (userData && userData.wishlist) {
        userWishlist = userData.wishlist.map((id) => id.toString());
      }
    } else {
      userWishlist = req.session.wishlist || [];
    }

    const relatedProducts = await product
      .find({
        category: productData.category,
        _id: { $ne: productId },
        isListed: true,
      })
      .limit(8)
      .populate("brand")
      .populate("category");

    const breadcrumb = [
      { name: "Home", url: "/" },
      { name: "Products", url: "/product" },
      { name: productData.productName, url: null },
    ];

    res.render("user/productDetails", {
      product: productData,
      relatedProducts: relatedProducts,
      user: userData,
      userWishlist,
      breadcrumb,
    });
  } catch (error) {
    console.error("Error:", error);
    res.redirect("/product");
  }
};

export default {
  productPage,
  getProducts,
  getProductDetails,
};
