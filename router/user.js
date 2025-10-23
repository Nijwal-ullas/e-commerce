import express from 'express';
const router = express.Router();
import userController from '../controller/userController.js';

router.get('/', userController.loadHomePage)

export default router;