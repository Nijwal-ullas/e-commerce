import mongoose from 'mongoose';

const { Schema } = mongoose;

const UserSchema = new Schema({
  Name: { type: String, required: true, trim: true },
  Password: { type: String , required: false },
  IsBlocked: { type: Boolean, default: false },
  Phone: { type: String , required: false, unique: true, sparse: true,default: null},
  ProfileImage: { type: String },
  Email: { type: String, required: true, unique: true, lowercase: true },
  googleId: { type: String,unique: true, sparse: true},
  UpdatedAt: { type: Date },
  CreatedAt: { type: Date },
});

const User = mongoose.model('User', UserSchema);
export default User;
