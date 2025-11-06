import user from "../model/userSchema.js";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
dotenv.config();

//home page
const loadHomePage = async (req, res) => {
  try {
    if (req.session.user) {
      const userData = await user.findById(req.session.user._id);
      return res.render("user/home", { user: userData });
    }
    return res.render("user/home");
  } catch (error) {
    console.log("Error loading homepage:", error.message);
    return res.status(500).send("Internal Server Error");
  }
};

//login side
const loadLoginPage = async (req, res) => {
  try {
    res.render("user/loginPage");
  } catch (error) {
    console.log(error.message);
    res.status(500).send("Internal Server Error");
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please fill in both email and password.",
      });
    }
    const existingUser = await user.findOne({ email });
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "User not found. Please register first.",
      });
    }
    if (existingUser.isBlocked) {
      return res.status(403).json({
        success: false,
        message: "You are blocked by admin.",
      });
    }
    const passwordMatch = await bcrypt.compare(password, existingUser.password);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Incorrect password.",
      });
    }
    req.session.user = {
      _id: existingUser._id,
      name: existingUser.name,
      email: existingUser.email,
    };

    console.log("User logged in successfully:", req.session.user);

    return res.status(200).json({
      success: true,
      message: "Login successful!",
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Please try again later.",
    });
  }
};

//register page
const loadRegisterPage = async (req, res) => {
  try {
    res.render("user/registerPage");
  } catch (error) {
    console.log(error.message);
  }
};

const generateOtp = () => Math.floor(100000 + Math.random() * 900000);

const register = async (req, res) => {
  try {
    const { name, email, phone, password, confirmPassword } = req.body;
    if (!email || !password || !name || !phone) {
      return res
        .status(400)
        .json({ success: false, message: "All fields required" });
    }
    if (password !== confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Passwords do not match" });
    }
    const existingUser = await user.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ success: false, message: "User already exists" });
    }
    const otp = generateOtp();
    console.log("Sending OTP to:", email, " | OTP:", otp);
    req.session.userOtp = otp;
    req.session.otpExpire = Date.now() + 1 * 60 * 1000;
    req.session.userData = { name, email, phone, password };
    await sendOtpEmail(email, otp);
    return res.status(200).json({
      success: true,
      message: "OTP sent to email.",
      redirectUrl: "/register-otp",
    });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

async function sendOtpEmail(email, otp) {
  if (!email) {
    console.error("Error: No email provided.");
    return false;
  }
  try {
    const transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject: "Your OTP Code",
      html: `<p>Your OTP code is <b>${otp}</b>. It is valid for 1 minute.</p>`,
    });

    return true;
  } catch (error) {
    console.log("Error sending OTP email:", error);
    return false;
  }
}

const loadRegisterOtpPage = async (req, res) => {
  try {
    const email = req.session?.userData?.email;
    res.render("user/registerOtpPage", { email });
  } catch (error) {
    console.log(error.message);
  }
};

const securePassword = async (password) => await bcrypt.hash(password, 10);

const registerOtpPage = async (req, res) => {
  try {
    const { otp } = req.body;

    if (!req.session.userOtp || Date.now() > req.session.otpExpire) {
      return res.status(400).json({ success: false, message: "OTP expired" });
    }
    if (String(req.session.userOtp) !== String(otp)) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }
    const userData = req.session.userData;
    if (!userData) {
      return res.status(400).json({
        success: false,
        message: "Session expired, register again",
      });
    }
    const hashedPassword = await securePassword(userData.password);
    const newUser = new user({
      name: userData.name,
      email: userData.email,
      phone: userData.phone,
      password: hashedPassword,
    });

    await newUser.save();

    req.session.userOtp = null;
    req.session.userData = null;
    req.session.otpExpire = null;

    req.session.user = {
      _id: newUser._id,
      name: newUser.name,
      email: newUser.email,
    };
    return res.status(200).json({ success: true, redirectUrl: "/" });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const resendOtp = async (req, res) => {
  try {
    const userData = req.session.userData;
    if (!userData || !userData.email) {
      return res.status(400).json({
        success: false,
        message: "Session expired. Please register again.",
      });
    }
    const email = userData.email;
    const otp = generateOtp();
    console.log(`New OTP for ${email}: ${otp}`);
    req.session.userOtp = otp;
    req.session.otpExpire = Date.now() + 1 * 60 * 1000;

    await sendOtpEmail(email, otp);
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

const logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
};

const loadForgotPasswordPage = async (req, res) => {
  try {
    res.render("user/forgotPasswordPage");
  } catch (error) {
    console.log(error.message);
    res.status(500).send("Internal Server Error");
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const userExist = await user.findOne({ email });
    if (!userExist) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000);
    console.log("FORGOT OTP:", otp);

    req.session.forgotOtp = otp;
    req.session.forgotEmail = email;
    req.session.forgotOtpExpire = Date.now() + 1 * 60 * 1000;

    await sendOtpEmail(email, otp);

    return res.json({
      success: true,
      message: "OTP sent",
      redirectUrl: "/forgot-otp",
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const loadForgotOtpPage = async (req, res) => {
  try {
    const email = req.session?.forgotEmail;
    if (!email) return res.redirect("/forgotPasswordPage");

    res.render("user/forgotOtpPage", { email });
  } catch (error) {
    console.log(error.message);
    res.status(500).send("Internal Server Error");
  }
};

const forgotOtpVerify = async (req, res) => {
  try {
    const { otp } = req.body;

    if (!req.session.forgotOtp || Date.now() > req.session.forgotOtpExpire) {
      return res.status(400).json({
        success: false,
        message: "OTP expired",
      });
    }

    if (String(req.session.forgotOtp) !== String(otp)) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    return res.status(200).json({
      success: true,
      message: "OTP verified",
      redirectUrl: "/reset-password",
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const loadResetPasswordPage = (req, res) => {
  const email = req.session.forgotEmail;
  if (!email) return res.redirect("/forgot-password");
  res.render("user/resetPasswordPage", { email });
};

const resetPassword = async (req, res) => {
  try {
    const { password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    const email = req.session.forgotEmail;
    const hashedPassword = await securePassword(password);

    await user.findOneAndUpdate(
      { email },
      { $set: { password: hashedPassword } }
    );

    req.session.forgotOtp = null;
    req.session.forgotOtpExpire = null;
    req.session.forgotEmail = null;

    return res.status(200).json({
      success: true,
      message: "Password reset successful!",
      redirectUrl: "/login",
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const resendForgotOtp = async (req, res) => {
  try {
    const email = req.session.forgotEmail;
    if (!email)
      return res
        .status(400)
        .json({ success: false, message: "Session expired" });

    const otp = generateOtp();
    req.session.forgotOtp = otp;
    req.session.forgotOtpExpire = Date.now() + 60000;

    await sendOtpEmail(email, otp);

    res.json({ success: true, message: "OTP resent!" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export default {
  loadHomePage,
  loadLoginPage,
  loadRegisterPage,
  register,
  login,
  loadRegisterOtpPage,
  registerOtpPage,
  resendOtp,
  logout,
  loadForgotPasswordPage,
  forgotPassword,
  loadForgotOtpPage,
  forgotOtpVerify,
  loadResetPasswordPage,
  resetPassword,
  resendForgotOtp,
};
