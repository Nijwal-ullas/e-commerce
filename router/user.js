import express from 'express';
const router = express.Router();
import userController from '../controller/userController.js';

router.get('/', userController.loadHomePage)
router.get('/login',userController.loadLoginPage);
router.post('/login',userController.login)
router.get('/register',userController.loadRegisterPage)
router.post('/register',userController.register)

export default router;