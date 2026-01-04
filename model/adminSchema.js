import mongoose from "mongoose";

const adminSchema = new mongoose.Schema({
  name: { type: String},
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  image: { type: String},
  phone: { type: Number},
  cloudinaryPublicId : {
    type: String,
    default: ""
  },
});

const Admin = mongoose.model("Admin", adminSchema);
export default Admin;
