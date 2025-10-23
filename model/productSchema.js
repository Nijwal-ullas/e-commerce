const mongoose = require('mongoose');

const { Schema, ObjectId } = mongoose;

const ProductSchema = new Schema({
  ProductName: { type: String },
  CategoryId: { type: Schema.Types.ObjectId },
  ProductImage: [{ type: String,  }],
  DiscountPercentage: { type: Double },
  SalePrice: { type: String },
  UpdatedAt: { type: Date },
  Description: { type: String },
  CreatedAt: { type: Date },
  IsListed: { type: String },
  RegularPrice: { type: String },
  BrandId: { type: Schema.Types.ObjectId },
  VariantItem: [{
     Ml: { type: Double },
     Quantity: { type: Double },
  }],
});

const Product = mongoose.model('Product', ProductSchema);

export default Product;
