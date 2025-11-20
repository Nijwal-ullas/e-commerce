import express from "express";
const router = express.Router();
import adminController from "../../controller/admin/adminController.js";
import productController from "../../controller/admin/productController.js";
import auth from "../../middleware/auth.js";
import upload from "../../helpers/multer.js";

router.get("/login", adminController.loadAdminLoginPage);
router.post("/login", adminController.login);
router.get("/dashboard", auth.adminAuth, adminController.loadDashboardPage);
router.get("/logout", auth.adminAuth, adminController.logout);



export default router;