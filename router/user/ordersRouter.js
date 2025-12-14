import express from "express"
import auth from "../../middleware/auth.js"
import orderController from "../../controller/user/orderController.js"

const router = express.Router();
router.use(auth.checkUser)

router.get("/orders",orderController.getOrder);
router.get("/orders/:orderId", orderController.getOrderDetails);  
router.post("/orders/cancel/:orderId", orderController.cancelOrder); 
router.get("/order/invoice/:orderId", orderController.downloadInvoice);
router.post("/orders/:orderId/return", orderController.requestOrderReturn);


export default router;