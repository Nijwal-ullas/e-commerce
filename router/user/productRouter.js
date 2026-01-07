import express from "express";
import productController from "../../controller/user/productController.js";
import auth from "../../middleware/auth.js";
const router = express.Router();

router.use(auth.isBlocked);


router.get("/product", productController.getProducts);
router.get("/products/filter", productController.filterProducts);
router.get("/product/:id", productController.getProductDetails);



export default router; 