const express = require('express');
const router = express.Router();
const { verifyToken } = require('../Middleware/jwt');
const {
  addSupplier,
  getSuppliers,
  updateSupplier,
  deleteSupplier
} = require('../Controller/Supplier/supplierController');

// Supplier routes
router.post('/add', verifyToken, addSupplier);
router.get('/get', verifyToken, getSuppliers);
router.put('/update', verifyToken, updateSupplier);
router.delete('/delete', verifyToken, deleteSupplier);

module.exports = router;