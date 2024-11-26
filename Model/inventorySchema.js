const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  adminId: {
    type: String,
    required: true
  },
  itemName: {
    type: String,
    required: true
  },
  sku: {
    type: String,
    required: true,
    unique: true
  },
  category: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  unit: {
    type: String,
    required: true
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  reorderPoint: {
    type: Number,
    required: true,
    min: 0
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier'
  },
  status: {
    type: String,
    enum: ['in-stock', 'low-stock', 'out-of-stock'],
    default: 'in-stock'
  }
//   customProperties: [{
//     propertyName: {
//       type: String,
//       required: true
//     },
//     propertyType: {
//       type: String,
//       enum: ['string', 'number', 'boolean'],
//       required: true
//     },
//     value: {
//       type: mongoose.Schema.Types.Mixed
//     }
//   }]
}, {
  timestamps: true
});

// Add indexes for common queries
inventorySchema.index({ adminId: 1, sku: 1 }, { unique: true });
inventorySchema.index({ adminId: 1, itemName: 1 });
inventorySchema.index({ adminId: 1, category: 1 });
inventorySchema.index({ adminId: 1, status: 1 });

module.exports = mongoose.model('Inventory', inventorySchema); 