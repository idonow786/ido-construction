const Inventory = require('../../Model/inventorySchema');
const Supplier = require('../../Model/supplierSchema');

// Create inventory item
const addInventoryItem = async (req, res) => {
  try {
    const {
      itemName,
      sku,
      category,
      quantity,
      unit,
      unitPrice,
      reorderPoint,
      supplierId,
      customProperties
    } = req.body;

    // Validate required fields
    if (!itemName || !sku || !category || !quantity || !unit || !unitPrice || !reorderPoint) {
      return res.status(400).json({
        message: 'Missing required fields'
      });
    }

    // Check if supplier exists if supplierId is provided
    if (supplierId) {
      const supplier = await Supplier.findOne({ 
        _id: supplierId, 
        adminId: req.adminId 
      });
      if (!supplier) {
        return res.status(404).json({
          message: 'Supplier not found'
        });
      }
    }

    // Calculate initial status
    const status = quantity === 0 ? 'out-of-stock' : 
                   quantity <= reorderPoint ? 'low-stock' : 
                   'in-stock';

    const newItem = new Inventory({
      adminId: req.adminId,
      itemName,
      sku,
      category,
      quantity,
      unit,
      unitPrice,
      reorderPoint,
      supplier: supplierId,
      status,
      customProperties: customProperties || []
    });

    const savedItem = await newItem.save();

    res.status(201).json({
      message: 'Inventory item created successfully',
      item: savedItem
    });

  } catch (error) {
    console.error('Error creating inventory item:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        message: 'An item with this SKU already exists'
      });
    }
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get inventory items with filtering and search
const getInventoryItems = async (req, res) => {
  try {
    const { 
      search, 
      category, 
      status, 
      customPropertyFilter,
      page = 1,
      limit = 10
    } = req.body;

    let query = { adminId: req.adminId };

    if (search) {
      query.$or = [
        { itemName: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
        { 'customProperties.propertyName': { $regex: search, $options: 'i' } },
        { 'customProperties.value': { $regex: search, $options: 'i' } }
      ];
    }

    if (category) query.category = category;
    if (status) query.status = status;

    if (customPropertyFilter) {
      const { propertyName, propertyType, value } = customPropertyFilter;
      if (propertyName) {
        query['customProperties'] = {
          $elemMatch: {
            propertyName: propertyName,
            ...(propertyType && { propertyType }),
            ...(value !== undefined && { value })
          }
        };
      }
    }

    const skip = (page - 1) * limit;

    const items = await Inventory.find(query)
      .populate('supplier', 'name contactInformation')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Inventory.countDocuments(query);

    res.status(200).json({
      items,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        currentPage: page,
        limit
      }
    });

  } catch (error) {
    console.error('Error fetching inventory items:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Update inventory item
const updateInventoryItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const updates = req.body;

    const item = await Inventory.findOne({
      _id: itemId,
      adminId: req.adminId
    });

    if (!item) {
      return res.status(404).json({
        message: 'Inventory item not found'
      });
    }

    // Update fields
    Object.keys(updates).forEach(key => {
      if (key !== '_id' && key !== 'adminId') {
        item[key] = updates[key];
      }
    });

    // Update status based on quantity and reorder point
    item.status = item.quantity === 0 ? 'out-of-stock' : 
                  item.quantity <= item.reorderPoint ? 'low-stock' : 
                  'in-stock';

    const updatedItem = await item.save();

    res.status(200).json({
      message: 'Inventory item updated successfully',
      item: updatedItem
    });

  } catch (error) {
    console.error('Error updating inventory item:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({
        message: 'Invalid item ID'
      });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Delete inventory item
const deleteInventoryItem = async (req, res) => {
  try {
    const { itemId } = req.params;

    const item = await Inventory.findOne({
      _id: itemId,
      adminId: req.adminId
    });

    if (!item) {
      return res.status(404).json({
        message: 'Inventory item not found'
      });
    }

    await Inventory.deleteOne({ _id: itemId });

    res.status(200).json({
      message: 'Inventory item deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting inventory item:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({
        message: 'Invalid item ID'
      });
    }
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

module.exports = {
  addInventoryItem,
  getInventoryItems,
  updateInventoryItem,
  deleteInventoryItem
}; 