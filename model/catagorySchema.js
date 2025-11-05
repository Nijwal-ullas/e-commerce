import mongoose from "mongoose";

const { Schema, ObjectId } = mongoose;

const CatagoriesSchema = new Schema(
  {
    name: { type: String },
    description: { type: String },
    isListed: { type: Boolean, default: true },
  },
  { timestamps: true }   
);

const Catagories = mongoose.model("Catagories", CatagoriesSchema);

export default Catagories;
