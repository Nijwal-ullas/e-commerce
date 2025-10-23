const mongoose = require('mongoose');

const { Schema, ObjectId } = mongoose;

const BrandSchema = new Schema({
  Name: { type: String },
  CreatedAt: { type: Date },
  BrandLogo: { type: String },
});

const Brand = mongoose.model('Brand', BrandSchema);

export default Brand;
