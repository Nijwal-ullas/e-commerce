// routes.js
import express from "express";
import addressController from "../../controller/user/addressController.js"
import auth from "../../middleware/auth.js"

const router = express.Router();
router.use(auth.checkUser)

router.get("/address", addressController.loadAddressPage);
router.get("/address/add", addressController.loadAddAddress); 
router.get("/address/edit/:id", addressController.loadAddAddress); 

router.post("/address/add", addressController.registerAddress); 
router.post("/address/edit/:id", addressController.registerAddress); 

router.delete("/address/delete/:id", addressController.deleteAddress)

export default router;