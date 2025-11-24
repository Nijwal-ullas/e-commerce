import mongoose from 'mongoose';

const { Schema } = mongoose;

const UserSchema = new Schema({
  name: { type: String, required: true, trim: true },
  password: { type: String  },
  isBlocked: { type: Boolean, default: false },
  phone: { type: String , required: false, sparse: true,default: null},
  profileImage: { type: String },
  email: { type: String, required: true, unique: true, lowercase: true },
  googleId: { type: String,unique: true, sparse: true},
  cloudinaryPublicIds: [{
  type: String
}]
},
{ timestamps: true }   
);

const User = mongoose.model('User', UserSchema);
export default User;
