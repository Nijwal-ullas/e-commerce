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
    
    // Add pagination
    const page = 1;
    const limit = 12;
    const skip = (page - 1) * limit;
    
    // Get total count for pagination
    const totalProductsCount = await product.countDocuments({ isListed: true });
    const totalPages = Math.ceil(totalProductsCount / limit);
    
    const products = await product.find({ isListed: true })
      .populate("category", "name")
      .populate("brand", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const productsWithPrices = products.map(product => {
      let minOfferPrice = 0;
      let minOriginalPrice = 0;
      let hasStock = false;
      let bestDiscount = 0;

      if (product.VariantItem && product.VariantItem.length > 0) {
        const inStockVariants = product.VariantItem.filter(v => v.Quantity > 0);
        hasStock = inStockVariants.length > 0;

        if (inStockVariants.length > 0) {
          minOfferPrice = Math.min(...inStockVariants.map(v => v.offerPrice || 0));
          minOriginalPrice = Math.min(...inStockVariants.map(v => v.Price || v.offerPrice || 0));
        } else {
          minOfferPrice = Math.min(...product.VariantItem.map(v => v.offerPrice || 0));
          minOriginalPrice = Math.min(...product.VariantItem.map(v => v.Price || v.offerPrice || 0));
        }

        product.VariantItem.forEach(variant => {
          if (variant.Price && variant.offerPrice && variant.Price > variant.offerPrice) {
            const discount = Math.round(((variant.Price - variant.offerPrice) / variant.Price) * 100);
            bestDiscount = Math.max(bestDiscount, discount);
          }
        });

        if (minOriginalPrice > 0 && minOriginalPrice > minOfferPrice) {
          const minPriceDiscount = Math.round(((minOriginalPrice - minOfferPrice) / minOriginalPrice) * 100);
          bestDiscount = Math.max(bestDiscount, minPriceDiscount);
        }
      }

      if (product.discount && product.discount > 0) {
        bestDiscount = Math.max(bestDiscount, product.discount);
      }

      return {
        ...product,
        price: minOfferPrice,
        oldPrice: minOriginalPrice > minOfferPrice ? minOriginalPrice : null,
        hasStock: hasStock,
        bestDiscount: bestDiscount > 0 ? bestDiscount : null
      };
    });

    res.render("user/product", {
      user: userData,
      brands,
      categories,
      products: productsWithPrices,
      userWishlist,
      totalProducts: totalProductsCount,
      totalPages: totalPages,
      currentPage: page,
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

    let filterQuery = { isListed: true };

    if (req.query.brands) {
      const brandIds = req.query.brands.split(',').filter(id => id && id.trim() !== '');
      if (brandIds.length > 0) {
        filterQuery.brand = { $in: brandIds };
      }
    }

    if (req.query.categories) {
      const categoryIds = req.query.categories.split(',').filter(id => id && id.trim() !== '');
      if (categoryIds.length > 0) {
        filterQuery.category = { $in: categoryIds };
      }
    }

    if (req.query.search) {
      const searchTerm = req.query.search.trim();
      if (searchTerm.length > 0) {
        filterQuery.productName = {
          $regex: searchTerm,
          $options: 'i'
        };
      }
    }

    if (req.query.size) {
      const size = parseInt(req.query.size);
      filterQuery.VariantItem = {
        $elemMatch: {
          Ml: size,
          Quantity: { $gt: 0 }
        }
      };
    }

    if (req.query.maxPrice) {
      const maxPrice = parseFloat(req.query.maxPrice) || 100000;
      if (!filterQuery.VariantItem) {
        filterQuery.VariantItem = {};
      }
      filterQuery.VariantItem.$elemMatch = {
        ...(filterQuery.VariantItem.$elemMatch || {}),
        offerPrice: { $lte: maxPrice }
      };
    }

    const totalCount = await product.countDocuments(filterQuery);
    
    const products = await product.find(filterQuery)
      .populate('category', 'name')
      .populate('brand', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const productsWithPrices = products.map(product => {
      let minOfferPrice = 0;
      let minOriginalPrice = 0;
      let hasStock = false;
      let bestDiscount = 0;

      if (product.VariantItem && product.VariantItem.length > 0) {
        const inStockVariants = product.VariantItem.filter(v => v.Quantity > 0);
        hasStock = inStockVariants.length > 0;

        if (inStockVariants.length > 0) {
          minOfferPrice = Math.min(...inStockVariants.map(v => v.offerPrice || 0));
          minOriginalPrice = Math.min(...inStockVariants.map(v => v.Price || v.offerPrice || 0));
        } else {
          minOfferPrice = Math.min(...product.VariantItem.map(v => v.offerPrice || 0));
          minOriginalPrice = Math.min(...product.VariantItem.map(v => v.Price || v.offerPrice || 0));
        }

        product.VariantItem.forEach(variant => {
          if (variant.Price && variant.offerPrice && variant.Price > variant.offerPrice) {
            const discount = Math.round(((variant.Price - variant.offerPrice) / variant.Price) * 100);
            bestDiscount = Math.max(bestDiscount, discount);
          }
        });

        if (minOriginalPrice > 0 && minOriginalPrice > minOfferPrice) {
          const minPriceDiscount = Math.round(((minOriginalPrice - minOfferPrice) / minOriginalPrice) * 100);
          bestDiscount = Math.max(bestDiscount, minPriceDiscount);
        }
      }

      if (product.discount && product.discount > 0) {
        bestDiscount = Math.max(bestDiscount, product.discount);
      }

      return {
        ...product,
        price: minOfferPrice,
        oldPrice: minOriginalPrice > minOfferPrice ? minOriginalPrice : null,
        hasStock: hasStock,
        bestDiscount: bestDiscount > 0 ? bestDiscount : null
      };
    });

    if (req.query.sortBy) {
      const sortOptions = {
        'price-low': (a, b) => a.price - b.price,
        'price-high': (a, b) => b.price - a.price,
        'latest': (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
        'name': (a, b) => a.productName.localeCompare(b.productName)
      };
      
      if (sortOptions[req.query.sortBy]) {
        productsWithPrices.sort(sortOptions[req.query.sortBy]);
      }
    }

    res.json({
      success: true,
      products: productsWithPrices,
      totalProducts: totalCount,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
      limit: limit
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
    const userId = req.session.user
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
      .populate("category")
      .lean();

    if (!productData) {
      return res.redirect("/product");
    }

    let bestDiscount = 0;
    let productPrice = 0;
    let productOldPrice = 0;

    if (productData.VariantItem && productData.VariantItem.length > 0) {
      const firstVariant = productData.VariantItem[0];
      productPrice = firstVariant.offerPrice || 0;
      productOldPrice = firstVariant.Price || 0;

      if (productOldPrice > 0 && productOldPrice > productPrice) {
        const variantDiscount = Math.round(((productOldPrice - productPrice) / productOldPrice) * 100);
        bestDiscount = Math.max(bestDiscount, variantDiscount);
      }

      productData.VariantItem.forEach(variant => {
        if (variant.Price && variant.offerPrice && variant.Price > variant.offerPrice) {
          const variantDiscount = Math.round(((variant.Price - variant.offerPrice) / variant.Price) * 100);
          bestDiscount = Math.max(bestDiscount, variantDiscount);
        }
      });
    }

    if (productData.discount && productData.discount > 0) {
      bestDiscount = Math.max(bestDiscount, productData.discount);
    }

    const productWithDiscount = {
      ...productData,
      price: productPrice,
      oldPrice: productOldPrice > productPrice ? productOldPrice : null,
      bestDiscount: bestDiscount > 0 ? bestDiscount : null
    };

    let userData = null;
    let userWishlist = [];

    if (userId) {
      userData = await user.findById(userId._id);
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
      .populate("category")
      .lean();

    const relatedProductsWithDiscounts = relatedProducts.map(related => {
      let relatedBestDiscount = 0;
      let relatedPrice = 0;
      let relatedOldPrice = 0;

      if (related.VariantItem && related.VariantItem.length > 0) {
        const firstRelatedVariant = related.VariantItem[0];
        relatedPrice = firstRelatedVariant.offerPrice || 0;
        relatedOldPrice = firstRelatedVariant.Price || 0;

        if (relatedOldPrice > 0 && relatedOldPrice > relatedPrice) {
          const variantDiscount = Math.round(((relatedOldPrice - relatedPrice) / relatedOldPrice) * 100);
          relatedBestDiscount = Math.max(relatedBestDiscount, variantDiscount);
        }

        related.VariantItem.forEach(variant => {
          if (variant.Price && variant.offerPrice && variant.Price > variant.offerPrice) {
            const variantDiscount = Math.round(((variant.Price - variant.offerPrice) / variant.Price) * 100);
            relatedBestDiscount = Math.max(relatedBestDiscount, variantDiscount);
          }
        });
      }

      if (related.discount && related.discount > 0) {
        relatedBestDiscount = Math.max(relatedBestDiscount, related.discount);
      }

      return {
        ...related,
        price: relatedPrice,
        oldPrice: relatedOldPrice > relatedPrice ? relatedOldPrice : null,
        bestDiscount: relatedBestDiscount > 0 ? relatedBestDiscount : null
      };
    });

    const breadcrumb = [
      { name: "Home", url: "/" },
      { name: "Products", url: "/product" },
      { name: productData.productName, url: null },
    ];

    res.render("user/productDetails", {
      product: productWithDiscount,
      relatedProducts: relatedProductsWithDiscounts,
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