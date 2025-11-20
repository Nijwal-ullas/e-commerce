import express from "express";
const router = express.Router();
import categoryController from "../../controller/admin/categoryController.js";
import auth from "../../middleware/auth.js";


router.get("/Category", auth.adminAuth, categoryController.categoryPage);
router.post('/Category', auth.adminAuth, categoryController.addCategory);
router.put("/Category/:id", auth.adminAuth, categoryController.editCategory);
router.delete("/Category/:id", auth.adminAuth, categoryController.deleteCategory);
router.patch("/Category/:id/list", auth.adminAuth, categoryController.listCategory);
router.patch("/Category/:id/unlist", auth.adminAuth, categoryController.unlistCategory);


export default router;