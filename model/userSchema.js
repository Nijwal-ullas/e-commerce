import mongoose from 'mongoose';

const { Schema, ObjectId } = mongoose;

const UserSchema = new Schema({
  Name: { type: String, required: true },
  Password: { type: String },
  IsBlocked: { type: Boolean },
  Phone: { type: String },
  ProfileImage: { type: String },
  Email: { type: String, required: true, unique: true },
  UpdatedAt: { type: Date },
  CreatedAt: { type: Date },
});

const User = mongoose.model('User', UserSchema);

export default User;

