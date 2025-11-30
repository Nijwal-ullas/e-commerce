import express from "express";
import cartController from "../../controller/user/cartController.js"
import auth from "../../middleware/auth.js"

const router = express.Router();
router.use(auth.checkUser)
router.use(auth.isBlocked)


router.get("/cart", cartController.getCart);
router.post("/cart/update-quantity", cartController.updateQuantity); 
router.post("/cart/remove/:id", cartController.removeFromCart);
router.post("/cart/:id", cartController.addCart);

export default router;