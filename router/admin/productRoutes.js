import express from "express";
const router = express.Router();
import productController from "../../controller/admin/productController.js";
import auth from "../../middleware/auth.js";
import upload from "../../helpers/multer.js";



router.get('/product', auth.adminAuth, productController.productPage);
router.post('/Product', auth.adminAuth, upload.array('images', 5), productController.addProduct);
router.get('/product/:id', auth.adminAuth, productController.getProduct);
router.put('/Product/:id', auth.adminAuth, upload.array('images', 5), productController.editProduct);
router.delete('/Product/:id', auth.adminAuth, productController.deleteProduct);
router.get('/productsJSON', auth.adminAuth, productController.getProduct);



export default router;