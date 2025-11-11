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

    stock: { type: Number, required: true },

    isListed: { type: Boolean, default: true }
  },
  { timestamps: true }
);

const Product = mongoose.model("Product", ProductSchema);

export default Product