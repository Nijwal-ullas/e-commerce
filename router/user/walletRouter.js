import express from "express"
import walletController from "../../controller/user/walletController.js"
import auth from "../../middleware/auth.js";

const router = express.Router();

router.get('/wallet', walletController.getWallet);
router.post('/wallet/create-order', walletController.createRazorpayOrder);
router.post('/wallet/verify-payment', walletController.verifyWalletPayment);
router.get('/wallet/balance', walletController.getWalletBalance);
router.post('/wallet/payment-failed', walletController.handlePaymentFailure);

export default router;

