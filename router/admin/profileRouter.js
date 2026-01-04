import express from "express";
import profileController from "../../controller/admin/profileController.js";
import auth from "../../middleware/auth.js";
import upload from "../../helpers/multer.js";

const router = express.Router();

router.get("/profile",auth.adminAuth,profileController.getProfile);
router.put("/profile/update",auth.adminAuth,profileController.updateProfile);
router.put("/profile/change-email",auth.adminAuth,profileController.changeEmail);
router.put("/profile/change-password",auth.adminAuth,profileController.changePassword);
router.post("/profile/upload-image",auth.adminAuth,upload.single('image'),profileController.uploadImage);


export default router;

