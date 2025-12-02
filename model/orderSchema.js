import mongoose from "mongoose";
const { Schema } = mongoose;

function generateOrderId() {
  return (
    "ORD-" + Date.now() + "-" + Math.floor(100000 + Math.random() * 900000)
  );
}

const OrdersSchema = new Schema(
  {
    orderId: {
      type: String,
      unique: true,
      default: generateOrderId,
    },

    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    address: { type: Schema.Types.ObjectId, ref: "Address" },

    orderedItem: [
      {
        productId: {
          type: Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },

        variantId: { type: Schema.Types.ObjectId },

        ml: { type: Number },

        quantity: { type: Number, required: true },

        price: { type: Number, required: true },

        status: {
          type: String,
          enum: [
            "Pending",
            "Processing",
            "Shipped",
            "Delivered",
            "Cancelled",
            "Returned",
          ],
          default: "Pending",
        },

        cancellationReason: { type: String },
        returnReason: { type: String },
        deliveredDate: { type: Date },
      },
    ],

    payment: {
      type: String,
      enum: ["COD", "Cod"],
      required: true,
    },

    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed", "Refunded"],
      default: "Pending",
    },

    totalPrice: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    finalAmount: { type: Number, required: true },

    couponId: { type: Schema.Types.ObjectId, ref: "Coupon" },

    shippingAddress: [
      {
        addressType: { type: String },
        alterPhone: { type: String },
        city: { type: String },
        country: { type: String },
        landmark: { type: String },
        phone: { type: String },
        pincode: { type: Number },
        state: { type: String },
        flatNumber: { type: String },
        streetName: { type: String },
      },
    ],

    orderStatus: {
      type: String,
      enum: [
        "Pending",
        "Processing",
        "Shipped",
        "Delivered",
        "Cancelled",
        "Returned",
      ],
      default: "Pending",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Orders", OrdersSchema);
