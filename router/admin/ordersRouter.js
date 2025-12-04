import express from "express";
const router = express.Router();
import orderController from "../../controller/admin/ordersController.js";
import auth from "../../middleware/auth.js";

router.get("/adminOrders", auth.adminAuth, orderController.getOrdersPage);
router.get("/adminOrders/:id", auth.adminAuth, orderController.getDetailPage);

router.put("/adminOrders/:id/status", auth.adminAuth, orderController.updateOrderStatus);
router.put("/adminOrders/:orderId/item/:itemId/status", auth.adminAuth, orderController.updateItemStatus);

router.put("/adminOrders/:orderId/approve-return", auth.adminAuth, orderController.approveReturnRequest);
router.put("/adminOrders/:orderId/reject-return", auth.adminAuth, orderController.rejectReturnRequest);
router.put("/adminOrders/:orderId/process-refund", auth.adminAuth, orderController.processRefund);

export default router;