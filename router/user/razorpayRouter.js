import express from "express";
import razorpayController from "../../controller/user/razorpayController.js";

const router = express.Router();

router.post("/create-order", razorpayController.createRazorpayOrder);
router.post("/verify-payment", razorpayController.verifyPayment);
router.post("/payment-failure", razorpayController.handlePaymentFailure); 

export default router;