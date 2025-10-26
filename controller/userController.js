import User from '../model/userSchema.js';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
dotenv.config();

const loadHomePage = async (req, res) => {
  try {
    res.render('user/home');
  } catch (error) {
    console.log(error.message);
    res.status(500).send("Internal Server Error");
  }
};

const loadLoginPage = async (req, res) => {
  try {
    res.render('user/loginPage');
  } catch (error) {
    console.log(error.message);
    res.status(500).send("Internal Server Error");
  }
};

const login = async (req, res) => {
  const { Email, Password } = req.body;
  try {
    const existingUser = await User.findOne({ Email });
    if (!existingUser) {
      return res.status(400).send("User not found");
    } else if (existingUser.Password !== Password) {
      return res.status(400).send("Invalid Password");
    } else {
      res.redirect('/');
    }
  } catch (error) {
    console.log(error.message);
    res.status(500).send("Login failed");
  }
};

const loadRegisterPage = async (req, res) => {
  try {
    res.render('user/registerPage');
  } catch (error) {
    console.log(error.message);
  }
};



const generateOtp = () => Math.floor(100000 + Math.random() * 900000);

async function sendOtpEmail(email, otp) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject: 'Your OTP Code',
      text: `Your OTP code is ${otp}. It is valid for 10 minutes.`,
      html: `<p>Your OTP code is <b>${otp}</b>. It is valid for 10 minutes.</p>`,
    });

    return true;
  } catch (error) {
    console.log("Error sending OTP email:", error);
    return false;
  }
}

const register = async (req, res) => {
  try {
    const { Name, Email, Password, ConfirmPassword } = req.body;
    if (Password !== ConfirmPassword) {
      return res.render('user/registerPage', { message: "Passwords do not match" });
    }
    const existingUser = await User.findOne({ Email });
    if (existingUser) {
      return res.render('user/registerPage', { message: "User already exists" });
    }
    const otp = Math.floor(100000 + Math.random() * 900000);
    console.log(`Generated OTP for ${Email} is: ${otp}`);
    req.session.userOtp = otp;
    req.session.userData = { Name, Email, Password };
    req.session.otpExpire = Date.now() + 10 * 60 * 1000; 
    await sendOtpEmail(Email, otp);
    res.render('user/registerOtpPage', { Email });
  } catch (error) {
    console.log("Error in register:", error);
    res.status(500).render('user/registerPage', { message: "Internal server error" });
  }
};



const securePassword = async (password) => {
  try {
    return await bcrypt.hash(password, 10);
  } catch (error) {
    console.log("Error hashing password:", error);
    throw error;
  }
};

const registerOtpPage = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!req.session.userOtp) {
      return res.status(400).json({ success: false, message: "OTP expired or session lost" });
    }
    if (Date.now() > req.session.otpExpire) {
      return res.status(400).json({ success: false, message: "OTP expired" });
    }
    if (String(otp) === String(req.session.userOtp)) {
      const user = req.session.userData;
      const passwordHash = await securePassword(user.Password);
      const newUser = new User({
        Name: user.Name,
        Email: user.Email,
        Password: passwordHash
      });
      await newUser.save();
      req.session.userOtp = null;
      req.session.userData = null;
      req.session.otpExpire = null;
      return res.json({ success: true, redirectUrl: "/" });
    } else {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }
  } catch (error) {
    console.log("Error in OTP verification:", error);
    res.status(500).json({ success: false, message: "Internal server error during OTP verification." });
  }
};


const resendOtp = async (req, res) => {
  try {
    const userData = req.session.userData;
    if (!userData || !userData.Email) {
      return res.status(400).json({
        success: false,
        message: "Session expired. Please register again.",
      });
    }

    const Email = userData.Email;

    // ✅ Generate new OTP
    const otp = generateOtp();
    req.session.userOtp = otp;
    req.session.otpExpire = Date.now() + 10 * 60 * 1000; // 10 mins expiry

    // Log OTP in terminal (VS Code)
    console.log(`🔁 New OTP for ${Email}: ${otp}`);

    // Send email
    const emailSent = await sendOtpEmail(Email, otp);

    if (emailSent) {
      return res.status(200).json({
        success: true,
        message: "OTP resent successfully. Please check your email.",
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "Failed to resend OTP. Try again later.",
      });
    }
  } catch (error) {
    console.log("Error in resending OTP:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error during OTP resend.",
    });
  }
};

export default { loadHomePage, loadLoginPage, loadRegisterPage, register, login, registerOtpPage, resendOtp };
