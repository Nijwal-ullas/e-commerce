import mongoose  from "mongoose";
const { Schema, ObjectId } = mongoose;

const OrdersSchema = new Schema({
  orderedItem: [{
     cancellationReason: { type: String },
     deliveredDate: { type: Date },
     ml: { type: String },
     price: { type: String },
     productId: { type: Schema.Types.ObjectId },
     quantity: { type: Number },
     returnReason: { type: String },
     status: { type: String, enum: [ 'Pending', 'Processing', 'Shipped' ] },
  }],
  payment: { type: String, enum: [ 'Cod'] },
  totalPrice: { type: Number },
  userId: { type: Schema.Types.ObjectId },
  address: { type: Schema.Types.ObjectId },
  discount: { type: Number },
  createdAt: { type: Date },
  updatedAt: { type: Date },
  paymentStatus: { type: String, enum: [ 'Pending', 'Done' ] },
  shippingAddress: [{
     addressType: { type: String },
     alterPhone: { type: String },
     city: { type: String },
     country: { type: String },
     landmark: { type: String },
     phone: { type: String },
     pincode: { type: Number },
     state: { type: String },
  }],
  finalAmount: { type: Number },
  couponId: { type: Schema.Types.ObjectId },
});

const Orders = mongoose.model('Orders', OrdersSchema);

export default Orders;
