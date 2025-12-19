import express from "express";
const router = express.Router();
import customerController from "../../controller/admin/customerController.js";
import auth from "../../middleware/auth.js";



router.get("/users", auth.adminAuth, customerController.customerInfo);
router.get('/blockCustomer', auth.adminAuth, customerController.blockCustomer);
router.get('/unblockCustomer', auth.adminAuth, customerController.unblockCustomer);


export default router;