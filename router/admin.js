    import express from "express";
    const router = express.Router();
    import adminController from "../controller/adminController.js";
    import auth from "../middleware/auth.js";
    import customerController from "../controller/customerController.js";
    import catagoryController from "../controller/catagoryController.js";
    import brandController from "../controller/brandController.js";
    import multer from "multer";
    import storage from "../helpers/multer.js";

    const upload = multer({ storage: storage });

    router.get("/login", adminController.loadAdminLoginPage);
    router.post("/login", adminController.login);
    router.get("/dashboard", auth.adminAuth, adminController.loadDashboardPage);
    router.get("/logout", adminController.logout);

    // customer routes
    router.get("/users", auth.adminAuth, customerController.customerInfo);
    router.get('/blockCustomer',auth.adminAuth,customerController.blockCustomer)
    router.get('/unblockCustomer',auth.adminAuth,customerController.unblockCustomer)
    router.delete('/deleteUser/:id',auth.adminAuth,customerController.deleteUser)

    // Category routes
    router.get("/catagory", auth.adminAuth, catagoryController.catagoryPage);
    router.post('/addCatagory',auth.adminAuth,catagoryController.addCatagory)
    router.put("/editCatagory/:id",auth.adminAuth, catagoryController.editCatagory);
    router.delete("/deleteCatagory/:id", auth.adminAuth,catagoryController.deleteCatagory);
    router.patch("/listCategory/:id",auth.adminAuth,catagoryController.listCatagory);
    router.patch("/unlistCategory/:id",auth.adminAuth,catagoryController.unlistCatagory);
    router.get("/catagory/search", auth.adminAuth, catagoryController.searchCatagory);

    //Brand routes
    router.get('/brand', auth.adminAuth, brandController.brandPage);
    router.get('/brand/search', auth.adminAuth, brandController.searchBrand);
    router.post('/addBrand', auth.adminAuth, upload.single('image'), brandController.addBrand); 
    router.put('/editBrand/:id', auth.adminAuth, upload.single('image'), brandController.editBrand); 
    router.delete('/deleteBrand/:id', auth.adminAuth, brandController.deleteBrand);



    export default router;
