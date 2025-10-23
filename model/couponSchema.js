const mongoose = require('mongoose');

const { Schema, ObjectId } = mongoose;

const CouponsSchema = new Schema({
  Code: { type: String },
  Description: { type: String },
  ExpiresAt: { type: Date },
  MinCartValue: { type: Double },
  Status: { type: String },
  UpdatedAt: { type: Date },
  DiscountVal: { type: Double },
  CreatedAt: { type: Date },
});

const Coupons = mongoose.model('Coupons', CouponsSchema);

export default Coupons;
