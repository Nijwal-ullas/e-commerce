import express from "express";
import userController from "../../controller/user/userController.js";
import auth from "../../middleware/auth.js";
import passport from "../../config/passport.js";

const router = express.Router();

router.use(auth.isBlocked);

router.get("/", userController.loadHomePage);
router.get("/login", userController.loadLoginPage);
router.post("/login", userController.login);
router.get("/register", userController.loadRegisterPage);
router.post("/register", userController.register);
router.get("/register-otp", userController.loadRegisterOtpPage);
router.post("/verify-otp", userController.registerOtpPage);
router.post("/resend-otp", userController.resendOtp);
router.get("/logout", userController.logout);
router.get("/forgot-password", userController.loadForgotPasswordPage);
router.post("/forgot-password", userController.forgotPassword);
router.get("/forgot-otp", userController.loadForgotOtpPage);
router.post("/forgot-verify-otp", userController.forgotOtpVerify);
router.get("/reset-password", userController.loadResetPasswordPage);
router.post("/reset-password", userController.resetPassword);
router.post("/resend-forgot-otp", userController.resendForgotOtp);

router.get(
  '/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get(
  '/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    req.session.user = {
      _id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      profileImage: req.user.profileImage || null
    };
    res.redirect('/');
  }
);


router.get("/aboutPage",userController.aboutPage);
router.get("/contactPage",userController.contactPage);

export default router;