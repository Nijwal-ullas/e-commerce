import User from "../../model/userSchema.js";
import bcrypt from "bcrypt";
import { otp as generateOtp, emailer } from "../../utilities/otpGenerator.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../../helpers/cloudinaryUpload.js";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const nameRegex = /^[A-Za-z]{6,20}$/;
const mobileRegex = /^\d{10}$/;

const profilePage = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect("/login");

    const userData = await User.findById(userId);

    return res.render("user/profilePage", {
      user: userData,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).send("Server Error");
  }
};

const updateProfile = async (req, res) => {
  try {
    const { name, mobile } = req.body;
    const userId = req.session.user;

    const existingUser = await User.findById(userId);
    if (!existingUser) {
      return res.status(400).json({
        success: false,
        message: "User not found",
      });
    }

    if (!nameRegex.test(name.trim())) {
      return res.status(400).json({
        success: false,
        message: "Name must be 6–20 letters long and contain only alphabets",
      });
    }

    if (!mobileRegex.test(mobile.trim())) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 10-digit mobile number",
      });
    }

    let profileImage = "";
    let cloudinaryPublicId = "";

    if (req.file) {
      try {
        if (existingUser.cloudinaryPublicId) {
          await deleteFromCloudinary(existingUser.cloudinaryPublicId);
        }

        const uploadResult = await uploadToCloudinary(
          req.file.buffer,
          "profile"
        );
        profileImage = uploadResult.secure_url;
        cloudinaryPublicId = uploadResult.public_id;
      } catch (uploadError) {
        console.error("Cloudinary upload error:", uploadError);
        return res.status(500).json({
          success: false,
          message: "Failed to upload image",
        });
      }
    }

    const updateData = {
      name: name.trim(),
      mobile: mobile.trim(),
    };

    if (profileImage && cloudinaryPublicId) {
      updateData.profileImage = profileImage;
      updateData.cloudinaryPublicId = cloudinaryPublicId;
    }

    await User.findByIdAndUpdate(userId, updateData, { new: true });

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

const changeEmail = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);

    return res.render("user/changeEmail", { user: userData });
  } catch (error) {
    console.log(error);
    res.status(500).send("Server Error");
  }
};

const verifyChangeEmail = async (req, res) => {
  try {
    const { newEmail, confirmEmail, currentPassword } = req.body;
    const userId = req.session.user;

    const existingUser = await User.findById(userId);

    if (!existingUser) {
      return res.status(400).json({
        success: false,
        message: "User not found",
      });
    }

    if (!emailRegex.test(newEmail.trim())) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email",
      });
    }

    if (newEmail !== confirmEmail) {
      return res.status(400).json({
        success: false,
        message: "Emails do not match",
      });
    }

    if (existingUser.email === newEmail) {
      return res.status(400).json({
        success: false,
        message: "New email cannot be the same as current email",
      });
    }

    const emailExists = await User.findOne({ email: newEmail });
    if (emailExists) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    const passwordMatch = await bcrypt.compare(
      currentPassword,
      existingUser.password
    );
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Incorrect password",
      });
    }

    const otp = generateOtp();
    console.log(`${newEmail} otp : ${otp}`);
    await emailer(newEmail, otp);

    req.session.userOtp = otp;
    req.session.otpExpire = Date.now() + 60 * 1000;
    req.session.userData = { newEmail };

    return res.status(200).json({
      success: true,
      redirectUrl: "/changeEmail-otp",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Server Error" });
  }
};

const loadOtpPage = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect("/login");
    }

    if (!req.session.userOtp || !req.session.userData?.newEmail) {
      return res.redirect("/profile/change-email");
    }

    const email = req.session.userData.newEmail;
    res.render("user/changeEmailOtp", { email });
  } catch (error) {
    console.log(error);
    res.status(500).send("Server Error");
  }
};

const registerOtpPage = async (req, res) => {
  try {
    const { otp } = req.body;
    const userId = req.session.user;

    if (!req.session.userOtp || Date.now() > req.session.otpExpire) {
      return res.status(400).json({
        success: false,
        message: "OTP expired",
      });
    }

    if (String(req.session.userOtp) !== String(otp)) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    const userData = req.session.userData;
    if (!userData || !userData.newEmail) {
      return res.status(400).json({
        success: false,
        message: "Session expired, please try again",
      });
    }

    await User.findByIdAndUpdate(userId, {
      email: userData.newEmail,
    });

    req.session.userOtp = null;
    req.session.userData = null;
    req.session.otpExpire = null;

    return res.status(200).json({
      success: true,
      redirectUrl: "/profile",
    });
  } catch (error) {
    console.log(error);
    res.status(500).send("Server Error");
  }
};

const resendOtp = async (req, res) => {
  try {
    const userData = req.session.userData;

    if (!userData || !userData.newEmail) {
      return res.status(400).json({
        success: false,
        message: "Session expired. Please try again.",
      });
    }

    const email = userData.newEmail;
    const otp = generateOtp();
    console.log(`resend otp for ${email} : ${otp}`);

    req.session.userOtp = otp;
    req.session.otpExpire = Date.now() + 1 * 60 * 1000;

    await emailer(email, otp);

    return res.status(200).json({
      success: true,
      message: "OTP resent successfully. Please check your email.",
    });
  } catch (error) {
    console.log("Error in resending OTP:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error during OTP resend.",
    });
  }
};

const loadchangePassword = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);
    return res.render("user/changePassword");
  } catch (error) {
    console.log(error);
    res.status(500).send("Server Error");
  }
};

const registerChangePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;
    const userId = req.session.user;
    const userData = await User.findById(userId);

    if (!userData) {
      return res.status(400).json({
        success: false,
        message: "user not found",
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, userData.password);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "current password is incorrect",
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: "current password and new password cant be same",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    userData.password = hashedPassword;

    await userData.save();

    return res.status(200).json({
      success: true,
      message: "changed succesfully",
    });
  } catch (error) {
    console.log(error);
    res.status(500).send("Server Error");
  }
};

export default {
  profilePage,
  updateProfile,
  changeEmail,
  verifyChangeEmail,
  loadOtpPage,
  registerOtpPage,
  resendOtp,
  loadchangePassword,
  registerChangePassword,
};
