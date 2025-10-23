const mongoose = require('mongoose');

const { Schema, ObjectId } = mongoose;

const WalletSchema = new Schema({
  Balance: { type: String },
  Wallet_transaction: [{
     Amount: { type: String },
     CreatedAt: { type: Date },
     Type: { type: String, enum: [ 'credit', 'debit' ] },
  }],
  UserId: { type: Schema.Types.ObjectId },
});

const Wallet = mongoose.model('Wallet', WalletSchema);

export default Wallet;

