import user from "../model/userSchema.js";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
dotenv.config();

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
      return res.render("user/loginPage", {
        message: "Please enter both email and password.",
      });
    }
    const existingUser = await user.findOne({ email });
    if (!existingUser) {
      return res.render("user/loginPage", { message: "User not found" });
    }
    if (existingUser.isBlocked) {
      return res.render("user/loginPage", {
        message: "You are blocked by admin. Please contact support.",
      });
    }

    const passwordMatch = await bcrypt.compare(password, existingUser.password);

    if (!passwordMatch) {
      return res.render("user/loginPage", { message: "Incorrect password" });
    }
    req.session.user = {
      _id: existingUser._id,
      name: existingUser.name,
      email: existingUser.email,
    };

    console.log("User logged in successfully:", req.session.user);

    return res.redirect("/");
  } catch (error) {
    console.log("Login error:", error);
    return res
      .status(500)
      .render("user/loginPage", { message: "Internal server error" });
  }
};

const loadRegisterPage = async (req, res) => {
  try {
    res.render("user/registerPage");
  } catch (error) {
    console.log(error.message);
  }
};

const generateOtp = () => Math.floor(100000 + Math.random() * 900000);

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

const register = async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;
    console.log("Registration data received:", req.body);
    if (!email) {
      return res.render("user/registerPage", { message: "Email is required." });
    }
    if (password !== confirmPassword) {
      return res.render("user/registerPage", {
        message: "Passwords do not match",
      });
    }
    const existingUser = await user.findOne({ email });
    if (existingUser) {
      return res.render("user/registerPage", {
        message: "User already exists",
      });
    }
    const otp = generateOtp();
    console.log(`Generated OTP for ${email} is: ${otp}`);
    req.session.userOtp = otp;
    req.session.userData = { name, email, password };
    req.session.otpExpire = Date.now() + 1 * 60 * 1000;
    if (!email || !email.trim()) {
      return res.render("user/registerPage", {
        message: "Invalid email address",
      });
    }
    await sendOtpEmail(email, otp);
    res.render("user/registerOtpPage", { email });
  } catch (error) {
    console.log("Error in register:", error);
    res
      .status(500)
      .render("user/registerPage", { message: "Internal server error" });
  }
};

const securePassword = async (password) => await bcrypt.hash(password, 10);

const registerOtpPage = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!req.session.userOtp || Date.now() > req.session.otpExpire) {
      return res
        .status(400)
        .json({ success: false, message: "OTP expired or invalid" });
    }
    if (String(otp) !== String(req.session.userOtp)) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }
    const userData = req.session.userData;
    if (!userData) {
      return res.status(400).json({
        success: false,
        message:
          "Session expired. Please start the registration process again.",
      });
    }
    const passwordHash = await securePassword(userData.password);
    const newUser = new user({
      name: userData.name,
      email: userData.email,
      password: passwordHash,
    });
    await newUser.save();
    req.session.user = {
      _id: newUser._id,
      name: newUser.name,
      email: newUser.email,
    };
    req.session.userOtp = null;
    req.session.userData = null;
    req.session.otpExpire = null;
    return res.json({ success: true, redirectUrl: "/" });
  } catch (error) {
    console.log("Error in OTP verification:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during OTP verification.",
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

const logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
};

export default {
  loadHomePage,
  loadLoginPage,
  loadRegisterPage,
  register,
  login,
  registerOtpPage,
  resendOtp,
  logout,
};
