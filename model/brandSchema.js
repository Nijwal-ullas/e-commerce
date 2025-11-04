import mongoose from 'mongoose';

const { Schema, ObjectId } = mongoose;

const BrandSchema = new Schema({
  name: { type: String },
  createdAt: { type: Date },
  brandLogo: { type: String },
});

const Brand = mongoose.model('Brand', BrandSchema);

export default Brand;
