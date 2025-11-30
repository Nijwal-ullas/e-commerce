import express from 'express';
import wishlistController from '../../controller/user/wishlistController.js';

const router = express.Router();

router.get('/wishlist', wishlistController.getWishlist);
router.post('/wishlist/add', wishlistController.addToWishlist);
router.delete('/wishlist/remove/:productId', wishlistController.removeFromWishlist);
router.delete('/wishlist/clear', wishlistController.clearWishlist);
router.get('/wishlist/check/:productId', wishlistController.checkWishlist);

export default router;