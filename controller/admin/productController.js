import Product from "../../model/productSchema.js";
import Category from "../../model/categorySchema.js";
import Brand from "../../model/brandSchema.js";
import { uploadToCloudinary, deleteFromCloudinary, getPublicIdFromUrl } from "../../helpers/cloudinaryUpload.js";

const nameRegex = /^[A-Za-z ]{3,20}$/;

const productPage = async (req, res) => {
  try {
    const search = req.query.search?.trim() || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    let query = {};
    if (search) {
      query = { productName: { $regex: search, $options: "i" } };
    }

    const productData = await Product.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate("category")
      .populate("brand")
      .lean();

    const count = await Product.countDocuments(query);
    const categories = await Category.find({ isListed: true });
    const brands = await Brand.find({});

    res.render("admin/productPage", {
      productData,
      currentPage: page,
      totalPages: Math.ceil(count / limit),
      totalProducts: count,
      search,
      categories,
      brands,
    });
  } catch (err) {
    console.error("Product page error:", err);
    res.status(500).send("Server error");
  }
};

const addProduct = async (req, res) => {
  try {
    let {
      productName,
      description,
      price,
      oldPrice,
      discount,
      category: categoryId,
      brand: brandId,
      variantMl,
      variantQuantity,
    } = req.body;

    productName = productName?.trim();
    description = description?.trim();

    if (!productName || !price || !categoryId || !brandId) {
      return res.status(400).json({
        success: false,
        message: "Product name, price, brand and category are required",
      });
    }

    if (!nameRegex.test(productName)) {
      return res.status(400).json({
        success: false,
        message: "Product name must be 3–20 characters and contain only letters",
      });
    }

    const exists = await Product.findOne({
      productName: { $regex: new RegExp(`^${productName}$`, "i") },
    });
    if (exists) {
      return res.status(400).json({
        success: false,
        message: "Product with this name already exists",
      });
    }

    if (isNaN(price) || price <= 0) {
      return res.status(400).json({
        success: false,
        message: "Price must be a valid positive number",
      });
    }

    if (description?.length < 10) {
      return res.status(400).json({
        success: false,
        message: "Description must be at least 10 characters long",
      });
    }

    if (!req.files || req.files.length < 3) {
      return res.status(400).json({
        success: false,
        message: "At least 3 images are required",
      });
    }

    const variantItems = [];
    if (variantMl && variantQuantity) {
      const mlArray = Array.isArray(variantMl) ? variantMl : [variantMl];
      const qtyArray = Array.isArray(variantQuantity)
        ? variantQuantity
        : [variantQuantity];

      for (let i = 0; i < mlArray.length; i++) {
        if (!mlArray[i] || !qtyArray[i]) continue;

        const Ml = Number(mlArray[i]);
        const Quantity = Number(qtyArray[i]);

        if (isNaN(Quantity) || Quantity < 0) {
          return res.status(400).json({
            success: false,
            message: "Variant quantity must be 0 or more",
          });
        }

        variantItems.push({ Ml, Quantity });
      }
    }

    if (variantItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one ML variant is required",
      });
    }

    if (variantItems.length > 4) {
      return res.status(400).json({
        success: false,
        message: "Maximum 4 ML variants allowed",
      });
    }

    const imageArr = [];
    const cloudinaryPublicIds = [];

    try {
      for (const file of req.files) {
        const uploadResult = await uploadToCloudinary(file.buffer, 'products');
        imageArr.push(uploadResult.secure_url);
        cloudinaryPublicIds.push(uploadResult.public_id);
      }
    } catch (uploadError) {
      console.error('Cloudinary upload error:', uploadError);
      for (const publicId of cloudinaryPublicIds) {
        await deleteFromCloudinary(publicId);
      }
      return res.status(500).json({
        success: false,
        message: "Failed to upload product images",
      });
    }

    const newProduct = new Product({
      productName,
      description,
      price: Number(price),
      oldPrice: oldPrice ? Number(oldPrice) : Number(price),
      category: categoryId,
      brand: brandId,
      images: imageArr,
      cloudinaryPublicIds,
      VariantItem: variantItems,
      isListed: true,
    });

    await newProduct.save();
    res.status(201).json({
      success: true,
      message: "Product added successfully!",
    });
  } catch (err) {
    console.error("Add product error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while adding product",
    });
  }
};

const getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate("category")
      .populate("brand")
      .lean();

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.json({ success: true, product });
  } catch (err) {
    console.error("Get product error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching product",
    });
  }
};

const editProduct = async (req, res) => {
  try {
    const { id } = req.params;

    let {
      productName,
      description,
      price,
      oldPrice,
      discount,
      category: categoryId,
      brand: brandId,
      isListed,
      variantMl,
      variantQuantity,
    } = req.body;

    productName = productName?.trim();
    description = description?.trim();

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    if (!nameRegex.test(productName)) {
      return res.status(400).json({
        success: false,
        message: "Product name must be 3–20 characters and contain only letters",
      });
    }

    const existingProduct = await Product.findOne({
      productName: { $regex: new RegExp(`^${productName}$`, "i") },
      _id: { $ne: id },
    });
    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: "Another product with this name already exists",
      });
    }

    const variantItems = [];
    if (variantMl && variantQuantity) {
      const mlArray = Array.isArray(variantMl) ? variantMl : [variantMl];
      const qtyArray = Array.isArray(variantQuantity)
        ? variantQuantity
        : [variantQuantity];

      for (let i = 0; i < mlArray.length; i++) {
        const Ml = Number(mlArray[i]);
        const Quantity = Number(qtyArray[i]);

        if (isNaN(Quantity) || Quantity < 0) {
          return res.status(400).json({
            success: false,
            message: "Variant quantity must be 0 or more",
          });
        }

        variantItems.push({ Ml, Quantity });
      }
    }

    if (variantItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one ML variant is required",
      });
    }

    if (variantItems.length > 4) {
      return res.status(400).json({
        success: false,
        message: "Maximum 4 ML variants allowed",
      });
    }

    let existingImages = [];
    if (req.body.existingImages) {
      existingImages = Array.isArray(req.body.existingImages)
        ? req.body.existingImages
        : [req.body.existingImages];
    }

    let newImages = [];
    let newCloudinaryPublicIds = [];

    if (req.files && req.files.length > 0) {
      try {
        for (const file of req.files) {
          const uploadResult = await uploadToCloudinary(file.buffer, 'products');
          newImages.push(uploadResult.secure_url);
          newCloudinaryPublicIds.push(uploadResult.public_id);
        }
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        for (const publicId of newCloudinaryPublicIds) {
          await deleteFromCloudinary(publicId);
        }
        return res.status(500).json({
          success: false,
          message: "Failed to upload new product images",
        });
      }
    }

    const finalImages = [...existingImages, ...newImages];
    const finalCloudinaryPublicIds = [
      ...(product.cloudinaryPublicIds || []).filter(publicId => 
        existingImages.some(img => getPublicIdFromUrl(img) === publicId)
      ),
      ...newCloudinaryPublicIds
    ];

    if (finalImages.length < 3) {
      for (const publicId of newCloudinaryPublicIds) {
        await deleteFromCloudinary(publicId);
      }
      return res.status(400).json({
        success: false,
        message: "At least 3 images are required",
      });
    }

    const removedImages = product.images.filter(img => !finalImages.includes(img));
    for (const removedImg of removedImages) {
      const publicId = getPublicIdFromUrl(removedImg);
      if (publicId) {
        await deleteFromCloudinary(publicId);
      }
    }

    product.productName = productName;
    product.description = description;
    product.price = Number(price);
    product.oldPrice = oldPrice ? Number(oldPrice) : Number(price);
    product.discount = discount ? Number(discount) : 0;
    product.category = categoryId;
    product.brand = brandId || null;
    product.images = finalImages;
    product.cloudinaryPublicIds = finalCloudinaryPublicIds;
    product.VariantItem = variantItems;
    product.isListed = isListed === "true";

    await product.save();

    res.status(200).json({
      success: true,
      message: "Product updated successfully!",
    });
  } catch (err) {
    console.error("Edit product error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while updating product",
    });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    if (product.cloudinaryPublicIds && product.cloudinaryPublicIds.length > 0) {
      for (const publicId of product.cloudinaryPublicIds) {
        try {
          await deleteFromCloudinary(publicId);
        } catch (deleteError) {
          console.error('Error deleting image from Cloudinary:', deleteError);
        }
      }
    }

    await Product.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (err) {
    console.error("Delete product error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while deleting product",
    });
  }
};

export default {
  productPage,
  addProduct,
  editProduct,
  getProduct,
  deleteProduct,
};