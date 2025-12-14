import mongoose from "mongoose";

const { Schema, ObjectId } = mongoose;

const WalletSchema = new Schema({
  Balance: { 
    type: Number, 
    default: 0 
  },
  Wallet_transaction: [{
     Amount: { type: Number },
     CreatedAt: { type: Date, default: Date.now }, 
     Type: { type: String, enum: ['credit', 'debit'] },
     Description : { type : String}
  }],
  UserId: { 
    type: Schema.Types.ObjectId,
    ref: 'User' 
  },
}, {
  timestamps: true 
});

const Wallet = mongoose.model('Wallet', WalletSchema);

export default Wallet;