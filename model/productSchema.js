import mongoose from 'mongoose';

const { Schema, ObjectId } = mongoose;

const ProductSchema = new Schema({
  productName: { type: String },
  categoryId: { type: Schema.Types.ObjectId },
  p1roductImage: [{ type: String,  }],
  discountPercentage: { type: Number },
  salePrice: { type: String },
  updatedAt: { type: Date },
  description: { type: String },
  createdAt: { type: Date },
  isListed: { type: String },
  regularPrice: { type: String },
  brandId: { type: Schema.Types.ObjectId },
  variantItem: [{
     ml: { type: Number },
     quantity: { type: Number },
  }],
});

const Product = mongoose.model('Product', ProductSchema);

export default Product;
