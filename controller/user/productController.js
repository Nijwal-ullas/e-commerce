import product from "../../model/productSchema.js";
import category from "../../model/categorySchema.js";
import brand from "../../model/brandSchema.js";
import user from "../../model/userSchema.js";

const productPage = async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    let userData = null;
    if (req.session.user) {
      userData = await user.findById(req.session.user._id);
    }

    const brands = await brand.find();
    const categories = await category.find({ isListed: true });
    const products = await product.find({ isListed: true }).limit(12);

    res.render("user/product", {
      user: userData,
      brands,
      categories,
      products,
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

    let filterQuery = {
      isListed: true,
    };

    if (req.query.categories) {
      try {
        const categoryIds = req.query.categories.split(",").filter(id => 
          id && id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id)
        );
        if (categoryIds.length > 0) {
          filterQuery.category = { $in: categoryIds };
        }
      } catch (error) {
        console.error("Invalid category IDs:", error);
      }
    }

    if (req.query.brands) {
      try {
        const brandIds = req.query.brands.split(",").filter(id => 
          id && id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id)
        );
        if (brandIds.length > 0) {
          filterQuery.brand = { $in: brandIds };
        }
      } catch (error) {
        console.error("Invalid brand IDs:", error);
      }
    }

    if (req.query.minPrice || req.query.maxPrice) {
      const minPrice = Math.max(0, parseFloat(req.query.minPrice) || 0);
      const maxPrice = Math.min(100000, parseFloat(req.query.maxPrice) || 10000);
      
      if (maxPrice >= minPrice) {
        filterQuery.price = {
          $gte: minPrice,
          $lte: maxPrice,
        };
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

        filterQuery.$or = [
          { productName: { $regex: sanitizedSearchTerm, $options: "i" } },
          { description: { $regex: sanitizedSearchTerm, $options: "i" } },
        ];
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
        "latest": { createdAt: -1 },
        "name": { productName: 1 },
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

    const categories = await category.find({ isListed: true });
    const brands = await brand.find();

    res.json({
      success: true,
      products,
      categories,
      brands,
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
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const productId = req.params.id;
    
    if (!productId || productId.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(productId)) {
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
    if (req.session.user) {
      userData = await user.findById(req.session.user._id);
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

    res.render("user/productDetails", {
      product: productData,
      relatedProducts: relatedProducts,
      user: userData,
    });
  } catch (error) {
    console.error("Error:", error);
    res.redirect("/product");
  }
};

const searchProducts = async (req, res) => {
  try {
    const { q: query, limit = 10 } = req.query;

    if (!query || query.trim().length === 0) {
      return res.json({
        success: true,
        products: [],
        suggestions: [],
      });
    }

    const searchTerm = query.trim();
    const limitedSearchTerm = searchTerm.substring(0, 100);
    const sanitizedSearchTerm = limitedSearchTerm.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

    const parsedLimit = Math.min(Math.max(1, parseInt(limit)), 50);

    const products = await product
      .find({
        isListed: true,
        $or: [
          { productName: { $regex: sanitizedSearchTerm, $options: "i" } },
          { description: { $regex: sanitizedSearchTerm, $options: "i" } },
          { "brand.name": { $regex: sanitizedSearchTerm, $options: "i" } },
        ],
      })
      .select("productName brand price images")
      .populate("brand", "name")
      .limit(parsedLimit)
      .lean();

    const suggestions = [
      ...new Set(
        products.flatMap((p) => [p.productName, p.brand?.name]).filter(Boolean)
      ),
    ].slice(0, 5);

    res.json({
      success: true,
      products,
      suggestions,
      searchTerm: limitedSearchTerm,
    });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({
      success: false,
      message: "Search failed",
    });
  }
};

export default { productPage, getProducts, getProductDetails, searchProducts };