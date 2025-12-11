import express from "express";
const router = express.Router();
import orderController from "../../controller/admin/ordersController.js";
import auth from "../../middleware/auth.js";

router.get("/adminOrders", auth.adminAuth, orderController.getOrdersPage);
router.get("/adminOrders/:id", auth.adminAuth, orderController.getDetailPage);

router.put("/adminOrders/:id/status", auth.adminAuth, orderController.updateOrderStatus);
router.put("/adminOrders/:orderId/item/:itemId/status", auth.adminAuth, orderController.updateItemStatus);

router.put("/adminOrders/:orderId/item/:itemId/approve-return", auth.adminAuth, orderController.approveItemReturn);
router.put("/adminOrders/:orderId/item/:itemId/reject-return", auth.adminAuth, orderController.rejectItemReturn);
router.put("/adminOrders/:orderId/item/:itemId/refund", auth.adminAuth, orderController.refundItem);

export default router;