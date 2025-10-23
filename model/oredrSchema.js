const mongoose = require('mongoose');

const { Schema, ObjectId } = mongoose;

const OrdersSchema = new Schema({
  OrderedItem: [{
     CancellationReason: { type: String },
     DeliveredDate: { type: Date },
     Ml: { type: String },
     Price: { type: String },
     ProductId: { type: Schema.Types.ObjectId },
     Quantity: { type: Number },
     ReturnReason: { type: String },
     Status: { type: String, enum: [ 'Pending', 'Processing', 'Shipped' ] },
  }],
  Payment: { type: String, enum: [ 'Cod', 'Wallet', 'Razorpay' ] },
  TotalPrice: { type: Number },
  UserId: { type: Schema.Types.ObjectId },
  Address: { type: Schema.Types.ObjectId },
  Discount: { type: Number },
  CreatedAt: { type: Date },
  UpdatedAt: { type: Date },
  PaymentStatus: { type: String, enum: [ 'Pending', 'Done' ] },
  ShippingAddress: [{
     AddressType: { type: String },
     AlterPhone: { type: String },
     City: { type: String },
     Country: { type: String },
     Landmark: { type: String },
     Phone: { type: String },
     Pincode: { type: Number },
     State: { type: String },
  }],
  FinalAmount: { type: Number },
  CouponId: { type: Schema.Types.ObjectId },
});

const Orders = mongoose.model('Orders', OrdersSchema);

export default Orders;
