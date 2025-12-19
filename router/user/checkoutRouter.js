import express from 'express';
import checkoutController from '../../controller/user/checkoutController.js';
import auth from '../../middleware/auth.js'

const router = express.Router();
router.use(auth.checkUser)

router.get('/checkout', checkoutController.getCheckout);
router.post('/checkout/place-order',checkoutController.placeOrder);
router.get('/order-success/:orderId', checkoutController.orderSuccess);

router.get('/address/:id', checkoutController.getAddress);  
router.post('/checkout/addAddress',checkoutController.addAddress)
router.put("/checkout/editAddress/:id",checkoutController.editAddress)
router.delete("/checkout/deleteAddress/:id",checkoutController.deleteAddress);
router.post("/checkout/apply-coupon", checkoutController.applyCoupon);
router.post("/checkout/remove-coupon", checkoutController.removeCoupon);




export default router;