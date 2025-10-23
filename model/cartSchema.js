const mongoose = require('mongoose');

const { Schema, ObjectId } = mongoose;

const CartSchema = new Schema({
  Cart_items: [{
     AddedAt: { type: Date },
     Price: { type: String },
     ProductId: { type: Schema.Types.ObjectId },
     Quantity: { type: String },
     TotalPrice: { type: String },
  }],
  CreatedAt: { type: Date },
  UserId: { type: Schema.Types.ObjectId },
});

const Cart = mongoose.model('Cart', CartSchema);

export default Cart;