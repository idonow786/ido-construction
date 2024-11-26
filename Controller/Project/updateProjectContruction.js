const ProjectC = require('../../Model/projectConstruction');
const Wallet = require('../../Model/Wallet');
const Vendor = require('../../Model/vendorSchema');
const Supplier = require('../../Model/supplierSchema');
const Inventory = require('../../Model/inventorySchema');
const { uploadFileToFirebase } = require('../../Firebase/uploadFileToFirebase');
const mongoose = require('mongoose');

const processExistingData = async (projectData) => {
  const safeParseOrSplit = (value) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch (e) {
        return value.split(',').map(item => item.trim());
      }
    }
    return value;
  };

  const parseDate = (dateString) => dateString ? new Date(dateString) : null;

  // Handle dates
  projectData.startDate = parseDate(projectData.startDate);
  projectData.estimatedCompletionDate = parseDate(projectData.estimatedCompletionDate);

  // Handle arrays and nested objects
  if (projectData.projectScope) {
    ['objectives', 'deliverables', 'exclusions'].forEach(field => {
      if (projectData.projectScope[field]) {
        projectData.projectScope[field] = safeParseOrSplit(projectData.projectScope[field]);
      }
    });
  }

  if (projectData.projectTeam) {
    ['teamMembers', 'subcontractors'].forEach(field => {
      if (projectData.projectTeam[field]) {
        projectData.projectTeam[field] = safeParseOrSplit(projectData.projectTeam[field]);
      }
    });
  }

  return projectData;
};

const updateProjectConstruction = async (req, res) => {
  try {
    const { projectId } = req.query;
    const adminId = req.adminId;
    let projectData = req.body;

    if (!projectId) {
      return res.status(400).json({ message: 'Project ID is required' });
    }

    const project = await ProjectC.findOne({ _id: projectId, adminId: adminId });
    if (!project) {
      return res.status(404).json({ message: 'Project not found or not authorized' });
    }

    // Store old project data for wallet update
    const oldProjectData = project.toObject();

    // Process vendors and suppliers
    if (projectData.vendorsAndSuppliers) {
      const processedEntities = [];
      for (const entity of projectData.vendorsAndSuppliers) {
        let entityDoc;
        if (entity.entityType === 'Vendor') {
          entityDoc = await Vendor.findById(entity.entity);
        } else {
          entityDoc = await Supplier.findById(entity.entity);
        }

        if (!entityDoc) {
          return res.status(404).json({
            message: `${entity.entityType} not found with ID: ${entity.entity}`
          });
        }

        processedEntities.push({
          entity: entityDoc._id,
          entityType: entity.entityType,
          role: entity.role,
          paymentAmount: entity.paymentAmount,
          paymentStatus: entity.paymentStatus || 'pending'
        });
      }
      projectData.vendorsAndSuppliers = processedEntities;
    }

    // Process materials
    if (projectData.materials) {
      const processedMaterials = [];
      for (const material of projectData.materials) {
        const inventoryItem = await Inventory.findById(material.inventoryItem);
        if (!inventoryItem) {
          return res.status(404).json({
            message: `Inventory item not found: ${material.inventoryItem}`
          });
        }

        // Calculate quantity difference
        const oldMaterial = project.materials.find(m => 
          m.inventoryItem.toString() === material.inventoryItem
        );
        const quantityDiff = oldMaterial ? 
          material.quantityRequired - oldMaterial.quantityRequired : 
          material.quantityRequired;

        if (quantityDiff > 0 && inventoryItem.quantity < quantityDiff) {
          return res.status(400).json({
            message: `Insufficient quantity for ${inventoryItem.itemName}`
          });
        }

        // Update inventory
        inventoryItem.quantity -= quantityDiff;
        await inventoryItem.save();

        processedMaterials.push({
          inventoryItem: inventoryItem._id,
          quantityRequired: material.quantityRequired,
          allocatedTo: material.allocatedTo,
          status: material.status || 'allocated'
        });

        // Record transaction if quantity changed
        if (quantityDiff !== 0) {
          project.materialTransactions.push({
            material: inventoryItem._id,
            quantity: Math.abs(quantityDiff),
            transactionType: quantityDiff > 0 ? 'deduction' : 'return',
            performedBy: adminId
          });
        }
      }
      projectData.materials = processedMaterials;
    }

    // Process existing data
    projectData = await processExistingData(projectData);

    // Update project fields
    Object.keys(projectData).forEach(key => {
      if (key !== 'documentation') {
        project[key] = projectData[key];
      }
    });

    // Handle file uploads
    if (req.files) {
      project.documentation = project.documentation || {};
      for (const [fieldName, files] of Object.entries(req.files)) {
        const docType = fieldName.split('[')[1].split(']')[0];
        const uploadedUrls = await Promise.all(
          files.map(async (file) => {
            return await uploadFileToFirebase(file.buffer, file.originalname);
          })
        );
        project.documentation[docType] = (project.documentation[docType] || []).concat(uploadedUrls);
      }
    }

    const updatedProject = await project.save();
    await updateWallet(adminId, oldProjectData, updatedProject.toObject());

    res.status(200).json({
      message: 'Project updated successfully',
      project: updatedProject
    });

  } catch (error) {
    console.error('Error updating project:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Validation Error', details: error.message });
    }
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

const updateWallet = async (adminId, oldProjectData, newProjectData) => {
  try {
    let wallet = await Wallet.findOne({ AdminID: adminId });
    
    if (!wallet) {
      wallet = new Wallet({ AdminID: adminId });
    }

    // Calculate old expenses
    let oldExpenses = 0;
    if (oldProjectData.budget && oldProjectData.budget.costBreakdown) {
      oldExpenses = Object.values(oldProjectData.budget.costBreakdown).reduce((sum, cost) => sum + Number(cost), 0);
    }
    if (oldProjectData.resources) {
      oldExpenses += oldProjectData.resources.reduce((sum, resource) => {
        return sum + (Number(resource.quantity) * Number(resource.unitCost));
      }, 0);
    }

    // Calculate new expenses
    let newExpenses = 0;
    if (newProjectData.budget && newProjectData.budget.costBreakdown) {
      newExpenses = Object.values(newProjectData.budget.costBreakdown).reduce((sum, cost) => sum + Number(cost), 0);
    }
    if (newProjectData.resources) {
      newExpenses += newProjectData.resources.reduce((sum, resource) => {
        return sum + (Number(resource.quantity) * Number(resource.unitCost));
      }, 0);
    }

    // Update wallet
    wallet.TotalExpenses = (Number(wallet.TotalExpenses) - oldExpenses + newExpenses).toString();
    
    // Recalculate Profit
    wallet.Profit = (Number(wallet.TotalRevenue) - Number(wallet.TotalExpenses)).toString();

    await wallet.save();
  } catch (error) {
    console.error('Error updating wallet:', error);
  }
};

module.exports = { updateProjectConstruction };
