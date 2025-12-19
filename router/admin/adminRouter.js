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
router.get("/order-status-report", auth.adminAuth,adminController.getOrderStatusReport);
router.get("/sales-report",auth.adminAuth,adminController.getSalesReport);
router.get("/sales-report/excel", auth.adminAuth,adminController.downloadExcel);
router.get("/sales-report/pdf", auth.adminAuth,adminController.downloadPdf);


export default router;