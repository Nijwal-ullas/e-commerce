import mongoose from 'mongoose';

const { Schema, ObjectId } = mongoose;

const UserSchema = new Schema({
  Name: { type: String, required: true, trim: true },
  Password: { type: String },
  IsBlocked: { type: Boolean, default: false },
  Phone: { type: String },
  ProfileImage: { type: String },
  Email: { type: String, required: true, unique: true, lowercase: true },
  UpdatedAt: { type: Date },
  CreatedAt: { type: Date },
});

const User = mongoose.model('User', UserSchema);

export default User;

