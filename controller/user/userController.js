import user from "../../model/userSchema.js";
import category from "../../model/categorySchema.js";
import product from "../../model/productSchema.js";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import { otp as generateOtp } from "../../utilities/otpGenerator.js";
dotenv.config();

const setCacheHeaders = (res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
};

const loadHomePage = async (req, res) => {
  try {
    setCacheHeaders(res);

    const categories = await category.find({ isListed: true });

    let newArrivalProducts = await product
      .find({
        isListed: true,
      })
      .sort({
        createdAt: -1,
        updatedAt: -1,
      })
      .limit(4)
      .populate("brand")
      .lean();

    newArrivalProducts.forEach((prod, index) => {
      console.log(`${index + 1}. ${prod.productName} - ID: ${prod._id}`);
    });

    if (req.session.user) {
      const userData = await user.findById(req.session.user._id);
      return res.render("user/home", {
        user: userData,
        products: newArrivalProducts,
        categories,
      });
    }
    return res.render("user/home", {
      products: newArrivalProducts,
      categories,
    });
  } catch (error) {
    console.log("Error loading homepage:", error.message);
    return res.status(500).send("Internal Server Error");
  }
};

const loadLoginPage = async (req, res) => {
  try {
    setCacheHeaders(res);

    if (req.session.user) {
      return res.redirect("/");
    }
    res.render("user/loginPage");
  } catch (error) {
    console.log(error.message);
    res.status(500).send("Internal Server Error");
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    if (req.session.user) {
      return res.status(200).json({
        success: true,
        message: "Already logged in",
        redirect: "/",
      });
    }

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
      redirect: "/",
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Please try again later.",
    });
  }
};

const loadRegisterPage = async (req, res) => {
  try {
    setCacheHeaders(res);

    if (req.session.user) {
      return res.redirect("/");
    }
    res.render("user/registerPage");
  } catch (error) {
    console.log(error.message);
    res.status(500).send("Internal Server Error");
  }
};

const register = async (req, res) => {
  try {
    if (req.session.user) {
      return res.status(200).json({
        success: true,
        message: "Already logged in",
        redirect: "/",
      });
    }

    const { name, email, phone, password, confirmPassword } = req.body;

    if (!email || !password || !name || !phone) {
      return res.status(400).json({
        success: false,
        message: "All fields required",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    const existingUser = await user.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
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
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
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
    setCacheHeaders(res);

    if (req.session.user) {
      return res.redirect("/");
    }

    const email = req.session?.userData?.email;
    if (!email) {
      return res.redirect("/register");
    }
    res.render("user/registerOtpPage", { email });
  } catch (error) {
    console.log(error.message);
    res.status(500).send("Internal Server Error");
  }
};

const securePassword = async (password) => await bcrypt.hash(password, 10);

const registerOtpPage = async (req, res) => {
  try {
    const { otp } = req.body;

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

    return res.status(200).json({
      success: true,
      redirectUrl: "/login",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
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

const logout = async (req, res) => {
  try {
    res.clearCookie("user-session");

    req.session.user = null;

    req.session.save((err) => {
      if (err) {
        console.log("Error saving session:", err);
        return res.status(500).send("Internal Server Error");
      }

      setCacheHeaders(res);
      res.redirect("/");
    });
  } catch (error) {
    console.log(error.message);
    res.status(500).send("Internal Server Error");
  }
};

const loadForgotPasswordPage = async (req, res) => {
  try {
    setCacheHeaders(res);

    if (req.session.user) {
      return res.redirect("/");
    }
    res.render("user/forgotPasswordPage");
  } catch (error) {
    console.log(error.message);
    res.status(500).send("Internal Server Error");
  }
};

const forgotPassword = async (req, res) => {
  try {
    if (req.session.user) {
      return res.status(200).json({
        success: true,
        message: "Already logged in",
        redirect: "/",
      });
    }

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
    setCacheHeaders(res);

    if (req.session.user) {
      return res.redirect("/");
    }

    const email = req.session?.forgotEmail;
    if (!email) return res.redirect("/forgot-password");

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
  setCacheHeaders(res);

  if (req.session.user) {
    return res.redirect("/");
  }

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
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Session expired",
      });
    }

    const otp = generateOtp();
    req.session.forgotOtp = otp;
    req.session.forgotOtpExpire = Date.now() + 60000;

    await sendOtpEmail(email, otp);

    res.json({
      success: true,
      message: "OTP resent!",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
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
