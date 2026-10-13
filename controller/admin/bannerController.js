import Banner from "../../model/bannerSchema.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../../helpers/cloudinaryUpload.js";
import statusCode from "../../utilities/statusCodes.js";
import errorMessage from "../../utilities/errorMessages.js";

const bannerPage = async (req, res) => {
  try {
    const banners = await Banner.find().sort({ displayOrder: 1, createdAt: -1 });
    res.render("admin/bannerPage", { banners });
  } catch (error) {
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

const addBanner = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "Banner image is required",
      });
    }

    const uploadResult = await uploadToCloudinary(req.file.buffer, "banners");

    const banner = new Banner({
      imageUrl: uploadResult.secure_url,
      cloudinaryPublicId: uploadResult.public_id,
      isActive: true,
    });

    await banner.save();

    res.status(statusCode.CREATED).json({
      success: true,
      message: "Banner added successfully",
    });
  } catch (error) {
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

const editBanner = async (req, res) => {
  try {
    const { id } = req.params;

    const banner = await Banner.findById(id);
    if (!banner) {
      return res.status(statusCode.NOT_FOUND).json({
        success: false,
        message: "Banner not found",
      });
    }

    if (req.file) {
      if (banner.cloudinaryPublicId) {
        await deleteFromCloudinary(banner.cloudinaryPublicId);
      }
      const uploadResult = await uploadToCloudinary(req.file.buffer, "banners");
      banner.imageUrl = uploadResult.secure_url;
      banner.cloudinaryPublicId = uploadResult.public_id;
    }

    await banner.save();

    res.json({ success: true, message: "Banner updated successfully" });
  } catch (error) {
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

const toggleBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const banner = await Banner.findById(id);
    if (!banner) {
      return res.status(statusCode.NOT_FOUND).json({
        success: false,
        message: "Banner not found",
      });
    }
    banner.isActive = !banner.isActive;
    await banner.save();
    res.json({
      success: true,
      message: `Banner ${banner.isActive ? "activated" : "deactivated"} successfully`,
      isActive: banner.isActive,
    });
  } catch (error) {
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

const deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const banner = await Banner.findById(id);
    if (!banner) {
      return res.status(statusCode.NOT_FOUND).json({
        success: false,
        message: "Banner not found",
      });
    }
    if (banner.cloudinaryPublicId) {
      await deleteFromCloudinary(banner.cloudinaryPublicId);
    }
    await Banner.findByIdAndDelete(id);
    res.json({ success: true, message: "Banner deleted successfully" });
  } catch (error) {
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

export default { bannerPage, addBanner, editBanner, toggleBanner, deleteBanner };
