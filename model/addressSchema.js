import mongoose from "mongoose";

const { Schema, ObjectId } = mongoose;

const AddressSchema = new Schema({
  name: { type: String, required: true },
  state: { type: String, required: true },
  city: { type: String, required: true },
  pincode: { 
    type: String, 
    required: true, 
  },
  addressType: { 
    type: String, 
    required: true, 
    enum: ['home', 'work', 'other']
  },
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  phone: { 
    type: String, 
    required: true, 
  },
  streetName: { type: String, required: true },
  country: { type: String, required: true },
  landMark: { type: String },
  alternativePhone: { 
    type: String, 
  },
  flatNumber: { type: String }
});

AddressSchema.index({ userId: 1 });

const Address = mongoose.model('Address', AddressSchema);

export default Address;
