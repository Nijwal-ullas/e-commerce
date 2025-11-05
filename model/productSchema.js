import mongoose from 'mongoose';

const { Schema, ObjectId } = mongoose;

const ProductSchema = new Schema({
  productName: { type: String },
  categoryId: { type: Schema.Types.ObjectId },
  p1roductImage: [{ type: String,  }],
  discountPercentage: { type: Number },
  salePrice: { type: String },
  description: { type: String },
  isListed: { type: String },
  regularPrice: { type: String },
  brandId: { type: Schema.Types.ObjectId },
  variantItem: [{
     ml: { type: Number },
     quantity: { type: Number },
  }],
},
{ timestamps: true }   
);

const Product = mongoose.model('Product', ProductSchema);

export default Product;
