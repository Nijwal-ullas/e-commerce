import mongoose from "mongoose";

const { Schema, ObjectId } = mongoose;

const CatagoriesSchema = new Schema({
  name: { type: String },
  updatedAt: { type: Date },
  createdAt: { type: Date },
  description: { type: String },
  isListed: { type: Boolean, default: true},
});

const Catagories = mongoose.model('Catagories', CatagoriesSchema);

export default Catagories;
