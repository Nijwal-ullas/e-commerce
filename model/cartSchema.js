import mongoose from "mongoose";

const { Schema, ObjectId } = mongoose;

const CartSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    cart_items: [
      {
        addedAt: { type: Date, default: Date.now },
        oldPrice: { type: Number},
        price: { type: Number, required: true },
        packageProductId: {
          type: Schema.Types.ObjectId,
          ref: "Product",
          required: true,
          index: true,
        },
        variantId: {
          type: Schema.Types.ObjectId,
          required: true,
        },
        variantName: {
          type: String,
          required: true,
        },
        variantMl: {
          type: Number,
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
          max: 10,
        },
        totalPrice: { type: Number, required: true },
      },
    ],
  },
  {
    timestamps: true,
  }
);

const Cart = mongoose.model("Cart", CartSchema);

export default Cart;
