import mongoose from "mongoose";
const { Schema, ObjectId } = mongoose;

const CouponsSchema = new Schema({
  code: { type: String },
  description: { type: String },
  expireAt: { type: Date },
  minCartValue: { type: Number },
  status: { type: Boolean , default:true},
  discountValue: { type: Number },
},
{
  timestamps : true
});

const Coupons = mongoose.model('Coupons', CouponsSchema);

export default Coupons;
