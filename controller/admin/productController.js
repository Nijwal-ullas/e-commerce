import Product from "../../model/productSchema.js";
import Category from "../../model/categorySchema.js";
import Brand from "../../model/brandSchema.js";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      limit,
      search,
      categories,
      brands,
    });
  } catch (err) {
    console.error("Product page error:", err);
    res.status(500).send("Server error: " + err.message);
  }
};

const addProduct = async (req, res) => {
  try {
    console.log("=== ADD PRODUCT DEBUG ===");
    
    const {
      productName,
      description,
      price,
      oldPrice,
      discount,
      category: categoryId,
      brand: brandId,
      stock,
    } = req.body;

    if (!productName?.trim() || !price || !stock || !categoryId) {
      req.files?.forEach((file) => fs.unlinkSync(file.path));
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const exists = await Product.findOne({
      productName: { $regex: new RegExp(`^${productName.trim()}$`, "i") },
    });
    if (exists) {
      req.files?.forEach((file) => fs.unlinkSync(file.path));
      return res.status(400).json({ success: false, message: "Product already exists" });
    }

    const cat = await Category.findById(categoryId);
    if (!cat) {
      req.files?.forEach((file) => fs.unlinkSync(file.path));
      return res.status(400).json({ success: false, message: "Invalid Category" });
    }

    if (brandId) {
      const brandExists = await Brand.findById(brandId);
      if (!brandExists) {
        req.files?.forEach((file) => fs.unlinkSync(file.path));
        return res.status(400).json({ success: false, message: "Invalid Brand" });
      }
    }

    if (!req.files || req.files.length < 3) {
      req.files?.forEach((file) => fs.unlinkSync(file.path));
      return res.status(400).json({ success: false, message: "At least 3 images are required" });
    }

    const RESIZED_DIR = path.join(process.cwd(), "public", "uploads", "products", "resized");
    console.log("Resized directory path:", RESIZED_DIR);

    if (!fs.existsSync(RESIZED_DIR)) {
      console.log("Creating resized directory...");
      fs.mkdirSync(RESIZED_DIR, { recursive: true });
    }

    const imageArr = [];

    for (const file of req.files) {
      try {
        console.log("Processing file:", file.filename);
        
        const resizedName = `resized-${file.filename}`;
        const resizedPath = path.join(RESIZED_DIR, resizedName);

        await sharp(file.path)
          .resize(440, 440, { fit: "cover", position: "center" })
          .jpeg({ quality: 90 })
          .toFile(resizedPath);

        const fullImagePath = `/uploads/products/resized/${resizedName}`;
        imageArr.push(fullImagePath);

        fs.unlinkSync(file.path);

      } catch (err) {
        console.error("Error processing image:", err);
        fs.unlinkSync(file.path);
      }
    }

    if (imageArr.length === 0) {
      return res.status(400).json({ success: false, message: "Failed to process images" });
    }

    const newProduct = new Product({
      productName: productName.trim(),
      description: description?.trim() || "",
      price: Number(price),
      oldPrice: oldPrice ? Number(oldPrice) : Number(price),
      discount: discount ? Number(discount) : 0,
      category: categoryId,
      brand: brandId || null,
      images: imageArr,
      stock: Number(stock),
      isListed: true,
    });

    await newProduct.save();
    res.status(201).json({ success: true, message: "Product added successfully!" });
  } catch (err) {
    console.error("addProduct error:", err);
    req.files?.forEach((file) => fs.unlinkSync(file.path));
    res.status(500).json({ success: false, message: "Server error: " + err.message });
  }
};

const getProduct = async (req, res) => {
  try {
    const { id } = req.params;
    
    const product = await Product.findById(id)
      .populate('category')
      .populate('brand')
      .lean();

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    res.json({ 
      success: true, 
      product 
    });
  } catch (err) {
    console.error("getProduct error:", err);
    res.status(500).json({ success: false, message: "Server error: " + err.message });
  }
};

const editProduct = async (req, res) => {
  try {
    console.log("=== EDIT PRODUCT DEBUG ===");
    const { id } = req.params;
    const {
      productName,
      description,
      price,
      oldPrice,
      discount,
      category: categoryId,
      brand: brandId,
      stock,
      isListed
    } = req.body;

    console.log("Product ID:", id);
    console.log("Request body:", req.body);
    console.log("Files received:", req.files?.length || 0);

    const product = await Product.findById(id);
    if (!product) {
      req.files?.forEach((file) => fs.unlinkSync(file.path));
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const duplicate = await Product.findOne({
      _id: { $ne: id },
      productName: { $regex: new RegExp(`^${productName.trim()}$`, "i") },
    });
    if (duplicate) {
      req.files?.forEach((file) => fs.unlinkSync(file.path));
      return res.status(400).json({ success: false, message: "Product name already exists" });
    }

    const cat = await Category.findById(categoryId);
    if (!cat) {
      req.files?.forEach((file) => fs.unlinkSync(file.path));
      return res.status(400).json({ success: false, message: "Invalid Category" });
    }

    let existingImages = [];
    if (req.body.existingImages) {
      if (Array.isArray(req.body.existingImages)) {
        existingImages = req.body.existingImages;
      } else {
        existingImages = req.body.existingImages.split(',').filter(img => img.trim() !== '');
      }
    }
    console.log("Existing images to keep:", existingImages);

    let newImages = [];
    if (req.files && req.files.length > 0) {
      const RESIZED_DIR = path.join(process.cwd(), "public", "uploads", "products", "resized");
      
      if (!fs.existsSync(RESIZED_DIR)) {
        fs.mkdirSync(RESIZED_DIR, { recursive: true });
      }

      for (const file of req.files) {
        try {
          const resizedName = `resized-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
          const resizedPath = path.join(RESIZED_DIR, resizedName);

          await sharp(file.path)
            .resize(440, 440, { fit: "cover", position: "center" })
            .jpeg({ quality: 90 })
            .toFile(resizedPath);

          const fullImagePath = `/uploads/products/resized/${resizedName}`;
          newImages.push(fullImagePath);

          fs.unlinkSync(file.path);
          console.log("New image processed:", fullImagePath);

        } catch (err) {
          console.error("Error processing new image:", err);
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        }
      }
    }

    const finalImages = [...existingImages, ...newImages];
    console.log("Final images count:", finalImages.length);

    if (finalImages.length < 3) {
      newImages.forEach(imagePath => {
        const filename = path.basename(imagePath);
        const filePath = path.join(process.cwd(), "public", "uploads", "products", "resized", filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
      return res.status(400).json({ success: false, message: "At least 3 images are required" });
    }

    const oldImages = product.images || [];
    const imagesToDelete = oldImages.filter(oldImg => !finalImages.includes(oldImg));
    
    imagesToDelete.forEach(imagePath => {
      const filename = path.basename(imagePath);
      const filePath = path.join(process.cwd(), "public", imagePath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log("Deleted old image:", filePath);
      }
    });

    product.productName = productName.trim();
    product.description = description?.trim() || "";
    product.price = Number(price);
    product.oldPrice = oldPrice ? Number(oldPrice) : Number(price);
    product.discount = discount ? Number(discount) : 0;
    product.category = categoryId;
    product.brand = brandId || null;
    product.stock = Number(stock);
    product.images = finalImages;
    product.isListed = isListed === 'true' || isListed === true;

    await product.save();
    console.log("Product updated successfully");

    res.status(200).json({ success: true, message: "Product updated successfully!" });
  } catch (err) {
    console.error("editProduct error:", err);
    req.files?.forEach((file) => {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    });
    res.status(500).json({ success: false, message: "Server error: " + err.message });
  }
};


const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    product.images.forEach((imagePath) => {
      const filename = path.basename(imagePath);
      const filePath = path.join(process.cwd(), "public", imagePath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });

    await Product.findByIdAndDelete(id);

    res.json({ success: true, message: "Product deleted successfully" });
  } catch (err) {
    console.error("deleteProduct error:", err);
    res.status(500).json({ success: false, message: "Server error: " + err.message });
  }
};

const getProductsJSON = async (req, res) => {
  try {
    const products = await Product.find()
      .populate("category")
      .populate("brand")
      .lean();

    res.json({ products });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};


export default { productPage, addProduct, editProduct, getProductsJSON, getProduct, deleteProduct };