const mongoose = require('mongoose');

const { Schema, ObjectId } = mongoose;

const WishlistSchema = new Schema({
  UserId: { type: Schema.Types.ObjectId },
  Products: [{
     AddedAt: { type: Date },
     ProductId: { type: Schema.Types.ObjectId },
  }],
  CreatedAt: { type: Date },
  UpdatedAt: { type: Date },
});

const Wishlist = mongoose.model('Wishlist', WishlistSchema);

export default Wishlist;
