import Brand from "../../model/brandSchema.js";
import Product from "../../model/productSchema.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../../../");

const brandNameRegex = /^[A-Za-z ]{2,20}$/;

const brandPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;
    const search = req.query.search?.trim() || "";

    const query = search ? { name: { $regex: search, $options: "i" } } : {};

    const totalBrands = await Brand.countDocuments(query);
    const brands = await Brand.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.render("admin/brandPage", {
      brands,
      currentPage: page,
      totalPages: Math.ceil(totalBrands / limit),
      totalBrands,
      search,
    });
  } catch (error) {
    console.error("brandPage error:", error.message);
    res.status(500).send("Server Error");
  }
};

const addBrand = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Brand name is required",
      });
    }

    if (!brandNameRegex.test(name.trim())) {
      return res.status(400).json({
        success: false,
        message:
          "Brand name must be 2-20 characters long and contain only letters",
      });
    }

    if(description && description.length > 100){
      return res.status(400).json({
        success: false,
        message: "Description cannot exceed 100 characters",
      })
    }

    const existingBrand = await Brand.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
    });
    if (existingBrand) {
      return res.status(400).json({
        success: false,
        message: "Brand already exists",
      });
    }

    let brandLogo = "";
    if (req.file) {
      brandLogo = `/uploads/brands/${req.file.filename}`;
    }

    const brand = new Brand({
      name: name.trim(),
      description: description?.trim() || "",
      brandLogo,
    });

    await brand.save();
    res.status(201).json({
      success: true,
      message: "Brand added successfully",
    });
  } catch (error) {
    console.error("addBrand error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const editBrand = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Brand name is required",
      });
    }

    const brand = await Brand.findById(id);
    if (!brand)
      return res.status(404).json({
        success: false,
        message: "Brand not found",
      });

    if (!brandNameRegex.test(name.trim())) {
      return res.status(400).json({
        success: false,
        message:
          "Brand name must be 2-20 characters long and contain only letters",
      });
    }

    const duplicateBrand = await Brand.findOne({
      name: { $regex: new regExp(`^${name.trim()}$`, "i") },
      _id: { $ne: id },
    });

    if (duplicateBrand) {
      return res.sratus(400).json({
        success: false,
        message: "Brand name already exists",
      });
    }

    if (req.file) {
      const oldLogoPath = path.join(ROOT, "public", brand.brandLogo || "");
      if (fs.existsSync(oldLogoPath)) fs.unlinkSync(oldLogoPath);
      brand.brandLogo = `/uploads/brands/${req.file.filename}`;
    }

    brand.name = name.trim();
    brand.description = description?.trim() || "";

    await brand.save();
    res.json({
      success: true,
      message: "Brand updated successfully",
    });
  } catch (error) {
    console.error("editBrand error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const deleteBrand = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || id === "undefined") {
      return res.status(400).json({
        success: false,
        message: "Invalid brand ID",
      });
    }

    const brand = await Brand.findById(id);
    if (!brand) {
      return res.status(404).json({
        success: false,
        message: "Brand not found",
      });
    }

    const productCount = await Product.countDocuments({ brand: id });
    if (productCount > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete brand; it is associated with products",
        productCount: productCount,
      });
    }

    if (brand.brandLogo) {
      const logoPath = path.join(ROOT, "public", brand.brandLogo);
      if (fs.existsSync(logoPath)) {
        fs.unlinkSync(logoPath);
      }
    }

    await Brand.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Brand deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting brand:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting brand",
    });
  }
};

export default { brandPage, addBrand, editBrand, deleteBrand };
