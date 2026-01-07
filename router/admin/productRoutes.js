import express from "express";
const router = express.Router();
import productController from "../../controller/admin/productController.js";
import auth from "../../middleware/auth.js";
import upload from "../../helpers/multer.js";



router.get('/product', auth.adminAuth, productController.getProducts);
router.post('/product', auth.adminAuth, upload.array('images', 10), upload.errorHandler, productController.addProduct);
router.get('/product/:id', auth.adminAuth, productController.productViewPage);
router.put('/product/:id', auth.adminAuth, upload.array('images', 10), upload.errorHandler, productController.editProduct)
router.delete('/product/:id', auth.adminAuth, productController.deleteProduct);



export default router;