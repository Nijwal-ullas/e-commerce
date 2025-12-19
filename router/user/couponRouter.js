import express from "express"
import couponController from "../../controller/user/couponController.js";

const router = express.Router();

router.get("/coupon/available-coupon",couponController.getAvailableCoupon);


export default router
