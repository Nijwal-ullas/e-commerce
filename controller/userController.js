import User from '../model/userSchema.js';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
dotenv.config();

// =================== LOAD HOME PAGE ===================
const loadHomePage = async (req, res) => {
  try {
    if (req.session.user) {
      const userData = await User.findById(req.session.user._id);
      console.log('Rendering homepage with user data:', userData);
      return res.render('user/home', { user: userData });
    }
    console.log('Rendering homepage without user data');
    return res.render('user/home');
  } catch (error) {
    console.log('Error loading homepage:', error.message);
    return res.status(500).send('Internal Server Error');
  }
};

// =================== LOAD LOGIN PAGE ===================
const loadLoginPage = async (req, res) => {
  try {
    res.render('user/loginPage');
  } catch (error) {
    console.log(error.message);
    res.status(500).send('Internal Server Error');
  }
};

// =================== LOGIN ===================
const login = async (req, res) => {
  const { Email, Password } = req.body;
  try {
    const existingUser = await User.findOne({ Email });
    if (!existingUser) {
      return res.render('user/loginPage', { message: 'User not found' });
    }

    if (existingUser.IsBlocked) {
      return res.render('user/loginPage', { message: 'You are blocked by admin' });
    }

    const passwordMatch = await bcrypt.compare(Password, existingUser.Password);
    if (!passwordMatch) {
      return res.render('user/loginPage', { message: 'Incorrect password' });
    }

    // ✅ Save full user info in session
    req.session.user = {
      _id: existingUser._id,
      name: existingUser.Name,
      email: existingUser.Email
    };

    console.log('User logged in:', req.session.user);
    res.redirect('/');
  } catch (error) {
    console.log(error.message);
    res.status(500).render('user/loginPage', { message: 'Internal server error' });
  }
};

// =================== LOAD REGISTER PAGE ===================
const loadRegisterPage = async (req, res) => {
  try {
    res.render('user/registerPage');
  } catch (error) {
    console.log(error.message);
  }
};

// =================== GENERATE OTP & SEND EMAIL ===================
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
      html: `<p>Your OTP code is <b>${otp}</b>. It is valid for 1 minute.</p>`,
    });

    return true;
  } catch (error) {
    console.log('Error sending OTP email:', error);
    return false;
  }
}

// =================== REGISTER ===================
const register = async (req, res) => {
  try {
    const { Name, Email, Password, ConfirmPassword } = req.body;

    if (Password !== ConfirmPassword) {
      return res.render('user/registerPage', { message: 'Passwords do not match' });
    }

    const existingUser = await User.findOne({ Email });
    if (existingUser) {
      return res.render('user/registerPage', { message: 'User already exists' });
    }

    const otp = generateOtp();
    console.log(`Generated OTP for ${Email} is: ${otp}`);

    req.session.userOtp = otp;
    req.session.userData = { Name, Email, Password };
    req.session.otpExpire = Date.now() + 1 * 60 * 1000;

    await sendOtpEmail(Email, otp);
    res.render('user/registerOtpPage', { Email });
  } catch (error) {
    console.log('Error in register:', error);
    res.status(500).render('user/registerPage', { message: 'Internal server error' });
  }
};

// =================== HASH PASSWORD ===================
const securePassword = async (password) => await bcrypt.hash(password, 10);

// =================== VERIFY OTP ===================
const registerOtpPage = async (req, res) => {
  try {
    const { otp } = req.body;

    if (!req.session.userOtp || Date.now() > req.session.otpExpire) {
      return res.status(400).json({ success: false, message: 'OTP expired or invalid' });
    }

    if (String(otp) !== String(req.session.userOtp)) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    const user = req.session.userData;
    const passwordHash = await securePassword(user.Password);

    const newUser = new User({
      Name: user.Name,
      Email: user.Email,
      Password: passwordHash
    });

    await newUser.save();

    // ✅ Save session after registration
    req.session.user = {
      _id: newUser._id,
      name: newUser.Name,
      email: newUser.Email
    };

    req.session.userOtp = null;
    req.session.userData = null;
    req.session.otpExpire = null;

    return res.json({ success: true, redirectUrl: '/' });
  } catch (error) {
    console.log('Error in OTP verification:', error);
    res.status(500).json({ success: false, message: 'Internal server error during OTP verification.' });
  }
};

// =================== RESEND OTP ===================
const resendOtp = async (req, res) => {
  try {
    const userData = req.session.userData;
    if (!userData || !userData.Email) {
      return res.status(400).json({ success: false, message: 'Session expired. Please register again.' });
    }

    const Email = userData.Email;
    const otp = generateOtp();
    console.log(`New OTP for ${Email}: ${otp}`);

    req.session.userOtp = otp;
    req.session.otpExpire = Date.now() + 1 * 60 * 1000;
    await sendOtpEmail(Email, otp);

    return res.status(200).json({ success: true, message: 'OTP resent successfully. Please check your email.' });
  } catch (error) {
    console.log('Error in resending OTP:', error);
    return res.status(500).json({ success: false, message: 'Internal server error during OTP resend.' });
  }
};

// =================== LOGOUT ===================
const logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
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
  logout
};
