import mongoose from 'mongoose';

const { Schema, ObjectId } = mongoose;

const BrandSchema = new Schema({
  name: { type: String },
  description: { type: String },
  brandLogo: { type: String },
},
{ timestamps: true }   
);

const Brand = mongoose.model('Brand', BrandSchema);

export default Brand;
