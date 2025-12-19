import express from "express";
import couponController from "../../controller/admin/couponController.js";
import auth from "../../middleware/auth.js";

const router = express.Router();

router.get("/coupon",auth.adminAuth,couponController.getCoupons)
router.post("/coupon/add",auth.adminAuth,couponController.addCoupon);
router.put("/coupon/edit/:id",auth.adminAuth,couponController.editCoupon);
router.delete("/coupon/delete/:id",auth.adminAuth,couponController.deleteCoupon);
router.patch("/coupon/status/:id",auth.adminAuth,couponController.statusUpdate)

export default router;