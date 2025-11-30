import mongoose from "mongoose";
const { Schema } = mongoose;

const WishlistSchema = new Schema({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  products: [{
    productId: { 
      type: Schema.Types.ObjectId, 
      ref: 'Product',
      required: true 
    },
    addedAt: { 
      type: Date, 
      default: Date.now 
    }
  }]
}, { 
  timestamps: true 
});

WishlistSchema.index({ userId: 1 });
WishlistSchema.index({ 'products.productId': 1 });

const Wishlist = mongoose.model('Wishlist', WishlistSchema);

export default Wishlist;