const mongoose = require('mongoose');

const { Schema, ObjectId } = mongoose;

const AddressSchema = new Schema({
  Name: { type: String, required: true },
  State: { type: String, required: true },
  City: { type: String, required: true },
  Pincode: { type: String, required: true },
  AddressType: { type: String, required: true, enum: [ 'home', 'work', 'other' ] },
  UserId: { type: Schema.Types.ObjectId, required: true },
  Phone: { type: String, required: true },
  StreetName: { type: String, required: true },
  Country: { type: String, required: true },
  LandMark: { type: String },
  AlternativePhone: { type: String },
  FlatNumber: { type: String },
});

const Address = mongoose.model('Address', AddressSchema);

export default Address;

