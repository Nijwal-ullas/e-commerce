import Brand from "../../model/brandSchema.js";
import Product from "../../model/productSchema.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../../helpers/cloudinaryUpload.js";
import statusCode from "../../utilities/statusCodes.js";
import errorMessage from "../../utilities/errorMessages.js";

const brandNameRegex = /^[A-Za-z ]{2,20}$/;

const brandPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
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
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

const addBrand = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name?.trim()) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "Brand name is required",
      });
    }

    if (!brandNameRegex.test(name.trim())) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message:
          "Brand name must be 2-20 characters long and contain only letters",
      });
    }

    if (description && description.length > 100) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "Description cannot exceed 100 characters",
      });
    }

    const existingBrand = await Brand.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
    });
    if (existingBrand) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "Brand already exists",
      });
    }

    let brandLogo = "";
    let cloudinaryPublicId = "";

    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(
          req.file.buffer,
          "brands"
        );
        brandLogo = uploadResult.secure_url;
        cloudinaryPublicId = uploadResult.public_id;
      } catch (uploadError) {
        console.error("Cloudinary upload error:", uploadError);
        return res.status(statusCode.SERVER_ERROR).json({
          success: false,
          message: "Failed to upload image",
        });
      }
    }

    const brand = new Brand({
      name: name.trim(),
      description: description?.trim() || "",
      brandLogo,
      cloudinaryPublicId,
    });

    await brand.save();
    res.status(statusCode.CREATED).json({
      success: true,
      message: "Brand added successfully",
    });
  } catch (error) {
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

const editBrand = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    if (!name?.trim()) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "Brand name is required",
      });
    }

    const brand = await Brand.findById(id);
    if (!brand) {
      return res.status(statusCode.NOT_FOUND).json({
        success: false,
        message: "Brand not found",
      });
    }

    if (!brandNameRegex.test(name.trim())) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message:
          "Brand name must be 2-20 characters long and contain only letters",
      });
    }

    const duplicateBrand = await Brand.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
      _id: { $ne: id },
    });

    if (duplicateBrand) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "Brand name already exists",
      });
    }

    if (description && description.length > 100) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "Description cannot exceed 100 characters",
      });
    }

    if (req.file) {
      try {
        if (brand.cloudinaryPublicId) {
          await deleteFromCloudinary(brand.cloudinaryPublicId);
        }

        const uploadResult = await uploadToCloudinary(
          req.file.buffer,
          "brands"
        );
        brand.brandLogo = uploadResult.secure_url;
        brand.cloudinaryPublicId = uploadResult.public_id;
      } catch (error) {
        console.error(error.message);
        res.status(statusCode.SERVER_ERROR).json({
          success: false,
          message: errorMessage.SERVER_ERROR,
        });
      }
    }

    brand.name = name.trim();
    brand.description = description?.trim() || "";

    await brand.save();

    res.json({
      success: true,
      message: "Brand updated successfully",
    });
  } catch (error) {
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

const deleteBrand = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || id === "undefined") {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "Invalid brand ID",
      });
    }

    const brand = await Brand.findById(id);
    if (!brand) {
      return res.status(statusCode.NOT_FOUND).json({
        success: false,
        message: "Brand not found",
      });
    }

    const productCount = await Product.countDocuments({ brand: id });
    if (productCount > 0) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "Cannot delete brand; it is associated with products",
        productCount: productCount,
      });
    }

    if (brand.cloudinaryPublicId) {
      try {
        await deleteFromCloudinary(brand.cloudinaryPublicId);
      } catch (deleteError) {
        console.error("Error deleting image from Cloudinary:", deleteError);
      }
    }

    await Brand.findByIdAndDelete(id);

    res.status(statusCode.OK).json({
      success: true,
      message: "Brand deleted successfully",
    });
  } catch (error) {
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

export default { brandPage, addBrand, editBrand, deleteBrand };
