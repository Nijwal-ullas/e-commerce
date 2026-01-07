import Admin from "../../model/adminSchema.js";
import bcrypt from "bcrypt";
import statusCode from "../../utilities/statusCodes.js";
import errorMessage from "../../utilities/errorMessages.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../../helpers/cloudinaryUpload.js";

const phoneRegex = /^[6-9]\d{9}$/;
const nameRegex = /^[A-Za-z ]{5,}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const getProfile = async (req, res) => {
  try {
    const adminId = req.session.adminId;
    if (!adminId) {
      return res.redirect("/admin/login");
    }

    const admin = await Admin.findById(adminId);

    res.render("admin/profilePage", {
      admin,
    });
  } catch (error) {
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    const adminId = req.session.adminId;
    const { name, phone } = req.body;

    if (!adminId) {
      return res.status(statusCode.UNAUTHORIZED).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!name || !phone) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "fill the required field",
      });
    }

    if (!nameRegex.test(name.trim())) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "enter a valid name",
      });
    }

    if (!phoneRegex.test(phone.trim())) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "enter valid phone number",
      });
    }

    await Admin.findByIdAndUpdate(
      adminId,
      { name: name.trim(), phone: phone.trim() },
      { new: true }
    );

    return res.status(statusCode.OK).json({
      success: true,
      message: "updated successfully",
    });
  } catch (error) {
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

const changeEmail = async (req, res) => {
  try {
    const adminId = req.session.adminId;
    const { password, newEmail } = req.body;
    if (!adminId) {
      return res.redirect("/admin/login");
    }
    const admin = await Admin.findById(adminId);
    if (!password || !newEmail) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "fill the required field",
      });
    }

    const isMatch = await bcrypt.compare(password, admin.password);

    if (!isMatch) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "incorrect password",
      });
    }

    if (!emailRegex.test(newEmail.trim())) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "enter a valid email",
      });
    }

    await Admin.findByIdAndUpdate(
      adminId,
      { email: newEmail.trim() },
      { new: true }
    );

    res.status(statusCode.OK).json({
      success: true,
      message: "email changed succussfully",
    });
  } catch (error) {
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

const changePassword = async (req, res) => {
  try {
    const adminId = req.session.adminId;
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const admin = await Admin.findById(adminId);

    if (!adminId) {
      return redirect("/admin/login");
    }

    if (!currentPassword || !newPassword) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "fill the required fields",
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, admin.password);

    if (!isMatch) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "current password is wrong",
      });
    }

    if (newPassword < 6) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "password must be atleast 6 character",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "new password not match",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await Admin.findByIdAndUpdate(
      adminId,
      { password: hashedPassword },
      { new: true }
    );

    res.status(statusCode.OK).json({
      success: true,
      message: "changed succussfully",
    });
  } catch (error) {
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

const uploadImage = async (req, res) => {
  try {
    const adminId = req.session.adminId;

    if (!adminId) {
      return res.status(statusCode.UNAUTHORIZED).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(statusCode.NOT_FOUND).json({
        success: false,
        message: "Admin not found",
      });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "No image uploaded",
      });
    }

    if (admin.cloudinaryPublicId) {
      await deleteFromCloudinary(admin.cloudinaryPublicId);
    }

    const uploadResult = await uploadToCloudinary(
      req.file.buffer,
      "admin-profile"
    );

    admin.image = uploadResult.secure_url;
    admin.cloudinaryPublicId = uploadResult.public_id;
    await admin.save();

    return res.status(statusCode.OK).json({
      success: true,
      imageUrl: uploadResult.secure_url,
      message: "Image uploaded successfully",
    });
  } catch (error) {
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

export default {
  getProfile,
  updateProfile,
  changeEmail,
  changePassword,
  uploadImage,
};
