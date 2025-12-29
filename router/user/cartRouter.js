import express from "express";
import cartController from "../../controller/user/cartController.js"
import auth from "../../middleware/auth.js"

const router = express.Router();
// router.use(auth.checkUser)
// router.use(auth.isBlocked)


router.get("/cart", auth.checkUser, auth.isBlocked, cartController.getCart);
router.post("/cart/update-quantity", auth.requireLoginJson, auth.isBlocked, cartController.updateQuantity);
router.post("/cart/:id", auth.requireLoginJson, auth.isBlocked, cartController.addCart);
router.post("/cart/remove/:id", auth.requireLoginJson, auth.isBlocked, cartController.removeFromCart);
router.post("/buy-now/:id", auth.requireLoginJson, auth.isBlocked, cartController.buyNow);


export default router;