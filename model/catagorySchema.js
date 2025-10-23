const mongoose = require('mongoose');

const { Schema, ObjectId } = mongoose;

const CatagoriesSchema = new Schema({
  Name: { type: String },
  UpdatedAt: { type: Date },
  CreatedAt: { type: Date },
  Description: { type: String },
  IsListed: { type: Boolean },
});

const Catagories = mongoose.model('Catagories', CatagoriesSchema);

export default Catagories;
