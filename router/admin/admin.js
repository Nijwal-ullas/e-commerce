    import express from "express";
    const router = express.Router();
    import adminController from "../../controller/admin/adminController.js";
    import customerController from "../../controller/admin/customerController.js";
    import categoryController from "../../controller/admin/categoryController.js";
    import brandController from "../../controller/admin/brandController.js";
    import productController from "../../controller/admin/productController.js"
    import auth from "../../middleware/auth.js";
    import multer from "multer";
    import upload from "../../helpers/multer.js";


    router.get("/login", adminController.loadAdminLoginPage);
    router.post("/login", adminController.login);
    router.get("/dashboard", auth.adminAuth, adminController.loadDashboardPage);
    router.get("/logout", adminController.logout);

    // customer routes
    router.get("/users", auth.adminAuth, customerController.customerInfo);
    router.get('/blockCustomer',auth.adminAuth,customerController.blockCustomer)
    router.get('/unblockCustomer',auth.adminAuth,customerController.unblockCustomer)

    // Category routes
    router.get("/category", auth.adminAuth, categoryController.categoryPage);
    router.post('/addCategory',auth.adminAuth,categoryController.addCategory)
    router.put("/editCategory/:id",auth.adminAuth, categoryController.editCategory);
    router.delete("/deleteCategory/:id", auth.adminAuth,categoryController.deleteCategory);
    router.patch("/listCategory/:id",auth.adminAuth,categoryController.listCategory);
    router.patch("/unlistCategory/:id",auth.adminAuth,categoryController.unlistCategory);
    router.get("/category/search", auth.adminAuth, categoryController.searchCategory);

    //Brand routes
    router.get('/brand', auth.adminAuth, brandController.brandPage);
    router.get('/brand/search', auth.adminAuth, brandController.searchBrand);
    router.post('/addBrand', auth.adminAuth, upload.single('image'), brandController.addBrand); 
    router.put('/editBrand/:id', auth.adminAuth, upload.single('image'), brandController.editBrand); 
    router.delete('/deleteBrand/:id', auth.adminAuth, brandController.deleteBrand);

    router.get('/products', auth.adminAuth, productController.productPage);
    router.post('/addProduct', auth.adminAuth, upload.array('images', 5), productController.addProduct);
    router.get('/products/:id', auth.adminAuth, productController.getProduct);
    router.put('/editProduct/:id', auth.adminAuth, upload.array('images', 5), productController.editProduct);
    router.delete('/deleteProduct/:id', auth.adminAuth, productController.deleteProduct);
    router.get('/productsJSON', auth.adminAuth, productController.getProduct);

 
    export default router;
