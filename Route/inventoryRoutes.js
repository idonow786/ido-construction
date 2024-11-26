const express = require('express');
const router = express.Router();
const { verifyToken } = require('../Middleware/jwt');
const {
  addInventoryItem,
  getInventoryItems,
  updateInventoryItem,
  deleteInventoryItem
} = require('../Controller/Inventory/inventoryController');

router.post('/add', verifyToken, addInventoryItem);
router.post('/get', verifyToken, getInventoryItems);
router.put('/update/:itemId', verifyToken, updateInventoryItem);
router.delete('/delete/:itemId', verifyToken, deleteInventoryItem);

module.exports = router; 