import mongoose from "mongoose";

const { Schema, ObjectId } = mongoose;

const CategoriesSchema = new Schema(
  {
    name: { type: String },
    description: { type: String },
    isListed: { type: Boolean, default: true },
    offer : { type: Number}
  },
  { timestamps: true }   
);

const Categories = mongoose.model("Categories", CategoriesSchema);

export default Categories;
