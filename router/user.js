import express from 'express';
import userController from '../controller/userController.js';
import passport from 'passport';
const router = express.Router();

router.get('/', userController.loadHomePage)
router.get('/login',userController.loadLoginPage);
router.post('/login',userController.login)
router.get('/register',userController.loadRegisterPage)
router.post('/register',userController.register)
router.post('/verify-otp', userController.registerOtpPage);
router.post('/resend-otp', userController.resendOtp);

router.get('/auth/google',passport.authenticate('google',{scope : ['profile','email']}))
router.get('/auth/google/callback',passport.authenticate('google',{failureRedirect : '/register'}),(req,res)=>{
    res.redirect('/')
})

export default router;