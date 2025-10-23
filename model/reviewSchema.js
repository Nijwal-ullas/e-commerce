const mongoose = require('mongoose');

const { Schema, ObjectId } = mongoose;

const ReviewSchema = new Schema({
  UserId: { type: Schema.Types.ObjectId },
  OrderId: { type: Schema.Types.ObjectId },
  ReviewComment: { type: String },
  Rating: { type: Number },
  CreatedAt: { type: Date },
  ProductId: { type: Schema.Types.ObjectId },
});

const Review = mongoose.model('Review', ReviewSchema);

export default Review;

