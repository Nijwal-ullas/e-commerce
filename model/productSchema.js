import mongoose from "mongoose";

const ProductSchema = new mongoose.Schema(
  {
    productName: { type: String, required: true },
    description: { type: String },
    price: { type: Number, required: true },
    oldPrice: { type: Number },
    discount: { type: Number, default: 0 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Categories" },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: "Brand" },
    images: [{ type: String }],
    isListed: { type: Boolean, default: true },
    VariantItem: [{
      Ml: { type: Number, required: true },
      Quantity: { type: Number, required: true, min: 0 },
    }],
    cloudinaryPublicIds: [{
  type: String
}]
  },
  { timestamps: true }
);

const Product = mongoose.model("Product", ProductSchema);
export default Product;