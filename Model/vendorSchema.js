const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({

  name: { type: String, required: true },
  adminId: { type: String },
  tasksId: [{ type: String }],

  role: {type:String,default:'vendor'},
  contactInformation: {
    email: String,
    phone: String,
    address: String,
    companyname:String,
  },
  password:{
    type:String
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
});

module.exports = mongoose.model('Vendor', vendorSchema);
