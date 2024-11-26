const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  ID: {
    type: Number,
    default: () => Math.floor(Math.random() * 1000000),
  },

  ExpenseTitle: {
    type: String,
  },
  Amount: {
    type: Number,
  },
  Date: {
    type: Date,
  },
  Description: {
    type: String,
  },
  ProjectId: {
    type: String,
  },
  ExpenseType: {
    type: String,
  },
  AdminID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
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

const Expense = mongoose.model('Expense', expenseSchema);

module.exports = Expense;
