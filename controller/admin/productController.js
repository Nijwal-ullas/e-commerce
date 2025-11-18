import Product from "../../model/productSchema.js";
import Category from "../../model/categorySchema.js";
import Brand from "../../model/brandSchema.js";
import fs from "fs";
import path from "path";
import sharp from "sharp";


const nameRegex = /^[A-Za-z ]{3,20}$/;

const deleteUploadedFiles = (files) => {
  files?.forEach((file) => {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
  });
};



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


    if (!productName || !price || !categoryId ||!brandId) {
      deleteUploadedFiles(req.files);
      return res.status(400).json({
        success: false,
        message: "Product name, price , brand and category are required",
      });
    }

    if (!nameRegex.test(productName)) {
      deleteUploadedFiles(req.files);
      return res.status(400).json({
        success: false,
        message:
          "Product name must be 3–20 characters and contain only letters",
      });
    }

    const exists = await Product.findOne({
      productName: { $regex: new RegExp(`^${productName}$`, "i") },
    });
    if (exists) {
      deleteUploadedFiles(req.files);
      return res.status(400).json({
        success: false,
        message: "Product with this name already exists",
      });
    }

    if (isNaN(price) || price <= 0) {
      deleteUploadedFiles(req.files);
      return res.status(400).json({
        success: false,
        message: "Price must be a valid positive number",
      });
    }

    if (description?.length < 10) {
      deleteUploadedFiles(req.files);
      return res.status(400).json({
        success: false,
        message: "Description must be at least 10 characters long",
      });
    }

    if (!req.files || req.files.length < 3) {
      deleteUploadedFiles(req.files);
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
          deleteUploadedFiles(req.files);
          return res.status(400).json({
            success: false,
            message: "Variant quantity must be 0 or more",
          });
        }

        variantItems.push({ Ml, Quantity });
      }
    }

    if (variantItems.length === 0) {
      deleteUploadedFiles(req.files);
      return res.status(400).json({
        success: false,
        message: "At least one ML variant is required",
      });
    }

    if (variantItems.length > 4) {
      deleteUploadedFiles(req.files);
      return res.status(400).json({
        success: false,
        message: "Maximum 4 ML variants allowed",
      });
    }


    const RESIZED_DIR = path.join(
      process.cwd(),
      "public",
      "uploads",
      "products",
      "resized"
    );

    if (!fs.existsSync(RESIZED_DIR))
      fs.mkdirSync(RESIZED_DIR, { recursive: true });

    const imageArr = [];

    for (const file of req.files) {
      try {
        const resizedName = `resized-${Date.now()}-${file.filename}`;
        const resizedPath = path.join(RESIZED_DIR, resizedName);

        await sharp(file.path)
          .resize(440, 440, { fit: "cover" })
          .jpeg({ quality: 90 })
          .toFile(resizedPath);

        imageArr.push(`/uploads/products/resized/${resizedName}`);
        fs.unlinkSync(file.path);
      } catch (err) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      }
    }


    const newProduct = new Product({
      productName,
      description,
      price: Number(price),
      oldPrice: oldPrice ? Number(oldPrice) : Number(price),
      category: categoryId,
      brand: brandId,
      images: imageArr,
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
    deleteUploadedFiles(req.files);
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
      deleteUploadedFiles(req.files);
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    if (!nameRegex.test(productName)) {
      deleteUploadedFiles(req.files);
      return res.status(400).json({
        success: false,
        message:
          "Product name must be 3–20 characters and contain only letters",
      });
    }

    const existingProduct = await Product.findOne({
      productName: { $regex: new RegExp(`^${productName}$`, "i") },
      _id: { $ne: id },
    });
    if (existingProduct) {
      deleteUploadedFiles(req.files);
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
          deleteUploadedFiles(req.files);
          return res.status(400).json({
            success: false,
            message: "Variant quantity must be 0 or more",
          });
        }

        variantItems.push({ Ml, Quantity });
      }
    }

    if (variantItems.length === 0) {
      deleteUploadedFiles(req.files);
      return res.status(400).json({
        success: false,
        message: "At least one ML variant is required",
      });
    }

    if (variantItems.length > 4) {
      deleteUploadedFiles(req.files);
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

    if (req.files && req.files.length > 0) {
      const RESIZED_DIR = path.join(
        process.cwd(),
        "public",
        "uploads",
        "products",
        "resized"
      );

      if (!fs.existsSync(RESIZED_DIR))
        fs.mkdirSync(RESIZED_DIR, { recursive: true });

      for (const file of req.files) {
        try {
          const resizedName =
            `resized-${Date.now()}-${Math.round(
              Math.random() * 1e9
            )}` + path.extname(file.originalname);

          const resizedPath = path.join(RESIZED_DIR, resizedName);

          await sharp(file.path)
            .resize(440, 440, { fit: "cover", position: "center" })
            .jpeg({ quality: 90 })
            .toFile(resizedPath);

          newImages.push(`/uploads/products/resized/${resizedName}`);
          fs.unlinkSync(file.path);
        } catch (err) {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        }
      }
    }

    const finalImages = [...existingImages, ...newImages];
    if (finalImages.length < 3) {
      return res.status(400).json({
        success: false,
        message: "At least 3 images are required",
      });
    }


    product.productName = productName;
    product.description = description;
    product.price = Number(price);
    product.oldPrice = oldPrice ? Number(oldPrice) : Number(price);
    product.discount = discount ? Number(discount) : 0;
    product.category = categoryId;
    product.brand = brandId || null;
    product.images = finalImages;
    product.VariantItem = variantItems;
    product.isListed = isListed === "true";

    await product.save();

    res.status(200).json({
      success: true,
      message: "Product updated successfully!",
    });
  } catch (err) {
    console.error("Edit product error:", err);
    deleteUploadedFiles(req.files);
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
