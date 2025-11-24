import express from "express";
import profileController from "../../controller/user/profileController.js"
import auth from "../../middleware/auth.js"
import upload from "../../helpers/multer.js"

const router = express.Router();
router.use(auth.isBlocked);
router.use(auth.checkUser)
    

router.get("/profile",profileController.profilePage)
router.get("/profile/edit", profileController.loadEditProfile);
router.post("/profile/edit",upload.single("profileImage"),profileController.updateProfile); 
router.get("/profile/change-email",profileController.changeEmail)
router.post("/profile/change-email",profileController.verifyChangeEmail)
router.get("/changeEmail-otp",profileController.loadOtpPage)
router.post("/changeEmail-otp",profileController.registerOtpPage)
router.post("/resend-otp",profileController.resendOtp)
router.get("/profile/change-password",profileController.loadchangePassword);
router.post("/profile/change-password",profileController.registerChangePassword);



export default router;