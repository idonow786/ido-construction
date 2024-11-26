const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  adminId: { 
    type: String,
    required: true
  },
  role: {
    type: String,
    default: 'supplier'
  },
  contactInformation: {
    email: String,
    phone: String,
    address: String,
    companyName: String
  },
  supplierType: {
    type: String,
    required: true
  },
  paymentTerms: {
    type: String
  },
  creditLimit: {
    type: Number
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  password: {
    type: String
  },
  customProperties: [{
    propertyName: {
      type: String,
      required: true
    },
    propertyType: {
      type: String,
      enum: ['string', 'number', 'boolean'],
      required: true
    },
    value: {
      type: mongoose.Schema.Types.Mixed
    }
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('Supplier', supplierSchema); 