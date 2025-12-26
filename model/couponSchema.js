import mongoose from "mongoose";
const { Schema, ObjectId } = mongoose;

const CouponsSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    description: { type: String },
    expireAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
    minCartValue: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: Boolean,
      default: true,
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0,
    },
    usedBy: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        orderId: {
          type: Schema.Types.ObjectId,
          ref: "Order",
          required: true,
        },
        usedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    // maxUsage: {
    //   type: Number,
    //   default: null,
    // },
    maxUsagePerUser: {
      type: Number,
      default: 1,
      min: 1
    },
    totalUsage: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

CouponsSchema.index({ code: 1, status: 1 });
CouponsSchema.index({ "usedBy.userId": 1, "usedBy.orderId": 1 });

const Coupons = mongoose.model("Coupons", CouponsSchema);

export default Coupons;
