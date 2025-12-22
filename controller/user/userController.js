import user from "../../model/userSchema.js";
import category from "../../model/categorySchema.js";
import product from "../../model/productSchema.js";
import wallet from "../../model/walletSchema.js";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { otp as generateOtp, emailer } from "../../utilities/otpGenerator.js";
dotenv.config();

const generateReferralCode = () => {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9])\S{6,}$/;
const nameRegex = /^[A-Za-z]{6,20}$/;

const aboutPage = async (req, res) => {
  try {
    return res.render("user/aboutPage");
  } catch (error) {
    console.log("Error loading homepage:", error.message);
    return res.status(500).send("Internal Server Error");
  }
};

const contactPage = async (req, res) => {
  try {
    return res.render("user/contact");
  } catch (error) {
    console.log("Error loading homepage:", error.message);
    return res.status(500).send("Internal Server Error");
  }
};

const loadHomePage = async (req, res) => {
  try {
    const categories = await category.find({ isListed: true });

    // Get initial products with pagination
    const page = 1;
    const limit = 12;
    const skip = (page - 1) * limit;

    let newArrivalProducts = await product
      .find({
        isListed: true,
      })
      .sort({
        createdAt: -1,
        updatedAt: -1,
      })
      .skip(skip)
      .limit(limit)
      .populate("brand")
      .lean();

    // Get total count for pagination
    const totalProducts = await product.countDocuments({ isListed: true });
    const totalPages = Math.ceil(totalProducts / limit);

    const productsWithVariantData = newArrivalProducts.map((productItem) => {
      let minOfferPrice = 0;
      let minOriginalPrice = 0;
      let hasStock = false;
      let variantCount = 0;

      if (productItem.VariantItem && productItem.VariantItem.length > 0) {
        const inStockVariants = productItem.VariantItem.filter(
          (v) => v.Quantity > 0
        );
        hasStock = inStockVariants.length > 0;
        variantCount = productItem.VariantItem.length;

        if (inStockVariants.length > 0) {
          minOfferPrice = Math.min(
            ...inStockVariants.map((v) => v.offerPrice || 0)
          );

          const originalPrices = inStockVariants.map(
            (v) => v.Price || v.offerPrice || 0
          );
          minOriginalPrice = Math.min(...originalPrices);
        } else {
          minOfferPrice = Math.min(
            ...productItem.VariantItem.map((v) => v.offerPrice || 0)
          );
          minOriginalPrice = Math.min(
            ...productItem.VariantItem.map((v) => v.Price || v.offerPrice || 0)
          );
        }
      }

      let discountPercentage = 0;
      if (minOriginalPrice > 0 && minOriginalPrice > minOfferPrice) {
        discountPercentage = Math.round(
          ((minOriginalPrice - minOfferPrice) / minOriginalPrice) * 100
        );
      }

      return {
        ...productItem,
        price: minOfferPrice,
        oldPrice: minOriginalPrice > minOfferPrice ? minOriginalPrice : null,
        hasStock: hasStock,
        variantCount: variantCount,
        discount: discountPercentage,
        VariantItem: productItem.VariantItem || [],
      };
    });

    let userData = null;
    let userWishlist = [];

    if (req.session.user) {
      userData = await user.findById(req.session.user._id);
      if (userData && userData.wishlist) {
        userWishlist = userData.wishlist.map((id) => id.toString());
      }
    }

    return res.render("user/home", {
      user: userData,
      userWishlist: userWishlist,
      products: productsWithVariantData,
      categories,
      totalProducts: totalProducts,
      totalPages: totalPages,
      currentPage: page,
    });
  } catch (error) {
    console.log("Error loading homepage:", error.message);
    return res.status(500).send("Internal Server Error");
  }
};

const loadLoginPage = async (req, res) => {
  try {
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

    const { name, email, phone, password, confirmPassword,referral } = req.body;

    if (!email || !password || !name || !phone) {
      return res.status(400).json({
        success: false,
        message: "All fields required",
      });
    }

    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    if (!nameRegex.test(name.trim())) {
      return res.status(400).json({
        success: false,
        message: "Name must be 6-20 letters long and contain only alphabets",
      });
    }

    if (phone.length !== 10) {
      return res.status(400).json({
        success: false,
        message: "number must 10 digit",
      });
    }

    const existingUser = await user.findOne({
      email: { $regex: new RegExp(`^${email.trim()}$`, "i") },
    });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    if (!passwordRegex.test(password.trim())) {
      return res.status(400).json({
        success: false,
        message: "please enter valid password",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    let referrer = null;

    if (referral) {
      referrer = await user.findOne({ referralCode : referral });

      if (!referrer) {
        return res.status(400).json({
          success: false,
          message: "Invalid referral code"
        });
      }
    }

   req.session.referrerId = referrer ? referrer._id : null;

    const otp = generateOtp();
    console.log(`${email} otp : ${otp}`);

    req.session.userOtp = otp;
    req.session.otpExpire = Date.now() + 1 * 60 * 1000;
    req.session.userData = { name, email, phone, password };

    await emailer(email, otp);

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

const loadRegisterOtpPage = async (req, res) => {
  try {
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
    const referrerId = req.session.referrerId || null;

    const newUser = new user({
      name: userData.name,
      email: userData.email,
      phone: userData.phone,
      password: hashedPassword,
      referralCode: generateReferralCode(),
      referredBy: referrerId
    });

    await newUser.save();

    req.session.userOtp = null;
    req.session.userData = null;
    req.session.otpExpire = null;
    req.session.referrerId = null;

    if(referrerId){
       const referrer = await user.findById(referrerId)

       if(referrer){
          let walletDoc = await wallet.findOne({UserId :referrer._id})
          if(!walletDoc){
             walletDoc = new wallet({
              UserId : referrer._id,
              Balance :0,
              Wallet_transaction : []
             });
          }
          walletDoc.Balance += 100;
          walletDoc.Wallet_transaction.push({
              Amount :100,
              Type : "credit",
              Description : "referral reward"
          })
          await walletDoc.save()
       }
    }

    let newUserWallet = await wallet.findOne({ UserId: newUser._id });

          if (!newUserWallet) {
            newUserWallet = new wallet({
              UserId: newUser._id,
              Balance: 0,
              Wallet_transaction: []
            });
          }

          newUserWallet.Balance += 50;
          newUserWallet.Wallet_transaction.push({
            Amount: 50,
            Type: "credit",
            Description: "Signup referral bonus"
          });

          await newUserWallet.save();



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
    console.log(`New otp for ${email} : ${otp}`);

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

const logout = async (req, res) => {
  try {
    res.clearCookie("user-session");

    req.session.user = null;

    req.session.save((err) => {
      if (err) {
        console.log("Error saving session:", err);
        return res.status(500).send("Internal Server Error");
      }

      res.redirect("/");
    });
  } catch (error) {
    console.log(error.message);
    res.status(500).send("Internal Server Error");
  }
};

const loadForgotPasswordPage = async (req, res) => {
  try {
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

    const otp = generateOtp();
    console.log(`Forgot otp : ${otp}`);

    req.session.forgotOtp = otp;
    req.session.forgotEmail = email;
    req.session.forgotOtpExpire = Date.now() + 1 * 60 * 1000;

    await emailer(email, otp);

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

    if (!passwordRegex.test(password.trim())) {
      return res.status(400).json({
        success: false,
        message: "Enter valid password",
      });
    }

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

    await emailer(email, otp);

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
  aboutPage,
  contactPage,
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
