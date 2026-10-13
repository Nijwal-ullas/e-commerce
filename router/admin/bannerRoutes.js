import express from "express";
const router = express.Router();
import bannerController from "../../controller/admin/bannerController.js";
import auth from "../../middleware/auth.js";
import upload from "../../helpers/multer.js";

router.get("/banner", auth.adminAuth, bannerController.bannerPage);
router.post("/banner", auth.adminAuth, upload.single("image"), bannerController.addBanner);
router.put("/banner/:id", auth.adminAuth, upload.single("image"), bannerController.editBanner);
router.patch("/banner/:id/toggle", auth.adminAuth, bannerController.toggleBanner);
router.delete("/banner/:id", auth.adminAuth, bannerController.deleteBanner);

export default router;
