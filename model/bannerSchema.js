import mongoose from "mongoose";

const { Schema } = mongoose;

const bannerSchema = new Schema(
  {
    title: { type: String, trim: true, default: "" },
    subtitle: { type: String, trim: true, default: "" },
    link: { type: String, trim: true, default: "" },
    imageUrl: { type: String, required: true },
    cloudinaryPublicId: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const Banner = mongoose.model("Banner", bannerSchema);

export default Banner;
