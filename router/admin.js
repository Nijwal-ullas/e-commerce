import express from 'express';
const router = express.Router();
import adminController from '../controller/adminController.js';
import auth from '../middleware/auth.js';

router.get('/login', adminController.loadAdminLoginPage)
router.post('/login',adminController.login)
router.get('/dashboard',auth.adminAuth,adminController.loadDashboardPage)
router.get('/logout',adminController.logout)

export default router; 