import express from "express";
const router = express.Router();
import adminController from "../controller/adminController.js";
import auth from "../middleware/auth.js";
import customerController from "../controller/customerController.js";

router.get("/login", adminController.loadAdminLoginPage);
router.post("/login", adminController.login);
router.get("/dashboard", auth.adminAuth, adminController.loadDashboardPage);
router.get("/logout", adminController.logout);
router.get("/users", auth.adminAuth, customerController.customerInfo);
router.get('/blockCustomer',auth.adminAuth,customerController.blockCustomer)
router.get('/unblockCustomer',auth.adminAuth,customerController.unblockCustomer)

export default router;
