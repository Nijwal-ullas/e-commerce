import express from 'express';
import checkoutController from '../../controller/user/checkoutController.js';

const router = express.Router();

router.get('/checkout', checkoutController.getCheckout);
router.post('/checkout/place-order',checkoutController.placeOrder);
router.get('/order-success/:orderId', checkoutController.orderSuccess);

router.get('/address/:id', checkoutController.getAddress);  
router.post('/checkout/addAddress',checkoutController.addAddress)
router.put("/checkout/editAddress/:id",checkoutController.editAddress)
router.delete("/checkout/deleteAddress/:id",checkoutController.deleteAddress);


export default router;