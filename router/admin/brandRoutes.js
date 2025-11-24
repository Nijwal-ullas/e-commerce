import express from "express";
const router = express.Router();
import brandController from "../../controller/admin/brandController.js";
import auth from "../../middleware/auth.js";
import upload from "../../helpers/multer.js";



router.get('/brand', auth.adminAuth, brandController.brandPage);
router.post('/brand', auth.adminAuth, upload.single('image'), brandController.addBrand);
router.put('/brand/:id', auth.adminAuth, upload.single('image'), upload.errorHandler, brandController.editBrand);
router.delete('/brand/:id', auth.adminAuth, brandController.deleteBrand);



export default router;