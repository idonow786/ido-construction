const ProjectC = require('../../Model/projectConstruction');
const Wallet = require('../../Model/Wallet');
const Vendor = require('../../Model/vendorSchema');
const Supplier = require('../../Model/supplierSchema');
const Inventory = require('../../Model/inventorySchema');
const { uploadFileToFirebase } = require('../../Firebase/uploadFileToFirebase');
const nodemailer = require("nodemailer");
const sendinBlue = require("nodemailer-sendinblue-transport");

// Create transporter for email
const transporter = nodemailer.createTransport(
  new sendinBlue({
    apiKey: process.env.SENDINBLUE_API_KEY,
  })
);

const sendProjectAssignmentEmail = async (receiverEmail, projectName, role, entityType, materials = []) => {
  try {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Project Assignment Notification</title>
          <style>
            .email-container {
              max-width: 600px;
              margin: 0 auto;
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333333;
            }
            .header {
              background-color: #1a4f7c;
              padding: 20px;
              text-align: center;
            }
            .header h1 {
              color: #ffffff;
              margin: 0;
              font-size: 24px;
            }
            .content {
              padding: 30px 20px;
              background-color: #ffffff;
            }
            .project-details {
              background-color: #f8f9fa;
              padding: 20px;
              border-radius: 5px;
              margin: 20px 0;
              border-left: 4px solid #1a4f7c;
            }
            .materials-list {
              margin-top: 20px;
              border-top: 1px solid #eee;
              padding-top: 15px;
            }
            .footer {
              background-color: #f8f9fa;
              padding: 20px;
              text-align: center;
              font-size: 12px;
              color: #666666;
            }
          </style>
        </head>
        <body>
          <div class="email-container">
            <div class="header">
              <h1>Project Assignment Notification</h1>
            </div>
            
            <div class="content">
              <p>Dear ${entityType},</p>
              
              <div class="project-details">
                <h2>Project Information:</h2>
                <p><strong>Project Name:</strong> ${projectName}</p>
                <p><strong>Your Role:</strong> ${role}</p>
              </div>
              
              ${materials.length > 0 ? `
                <div class="materials-list">
                  <h3>Allocated Materials:</h3>
                  <ul>
                    ${materials.map(m => `
                      <li>${m.name} - Quantity: ${m.quantity}</li>
                    `).join('')}
                  </ul>
                </div>
              ` : ''}
              
              <p>Please log in to your account for more details and project specifications.</p>
            </div>
            
            <div class="footer">
              <p>This is an automated message from GAAP Project Management System</p>
              <p>© ${new Date().getFullYear()} GAAP. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const mailOptions = {
      from: process.env.MAIL_FROM || 'noreply@gaap.ae',
      to: receiverEmail,
      subject: `Project Assignment: ${projectName}`,
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully:", info.response);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending email:", error);
    throw new Error("Failed to send email notification");
  }
};

const addProjectConstruction = async (req, res) => {
  try {
    const projectData = req.body;
    console.log('Project Data: ', projectData);
    if (!projectData.projectName) {
      return res.status(400).json({ message: 'Project name is required' });
    }
  // Process vendors and suppliers
  if (projectData.vendorsAndSuppliers) {
    const processedEntities = [];
    for (const entity of projectData.vendorsAndSuppliers) {
      const EntityModel = entity.entityType === 'Vendor' ? Vendor : Supplier;
      const entityDoc = await EntityModel.findOne({ 
        _id: entity.entity,
        adminId: req.adminId 
      });

      if (!entityDoc) {
        return res.status(404).json({ 
          message: `${entity.entityType} not found or unauthorized` 
        });
      }

      processedEntities.push({
        entity: entityDoc._id,
        entityType: entity.entityType,
        role: entity.role,
        paymentAmount: entity.paymentAmount,
        paymentStatus: 'pending',
        assignedDate: new Date()
      });

      // Send notification email
      try {
        const allocatedMaterials = projectData.materials
          .filter(m => m.allocatedTo?.vendor?.equals(entityDoc._id))
          .map(m => ({
            name: m.inventoryItem.itemName,
            quantity: m.quantityRequired
          }));

        await sendProjectAssignmentEmail(
          entityDoc.contactInformation.email,
          projectData.projectName,
          entity.role,
          entity.entityType,
          allocatedMaterials
        );
      } catch (emailError) {
        console.error('Error sending notification:', emailError);
      }
    }
    projectData.vendorsAndSuppliers = processedEntities;
  }

  // Process materials and update inventory
  if (projectData.materials) {
    const processedMaterials = [];
    for (const material of projectData.materials) {
      const inventoryItem = await Inventory.findOne({
        _id: material.inventoryItem,
        adminId: req.adminId
      });

      if (!inventoryItem) {
        return res.status(404).json({ 
          message: `Inventory item not found: ${material.inventoryItemId}` 
        });
      }

      if (inventoryItem.quantity < material.quantityRequired) {
        return res.status(400).json({ 
          message: `Insufficient quantity for ${inventoryItem.itemName}` 
        });
      }

      // Deduct from inventory
      inventoryItem.quantity -= material.quantityRequired;
      await inventoryItem.save();

      processedMaterials.push({
        inventoryItem: inventoryItem._id,
        quantityRequired: material.quantityRequired,
        allocatedTo: material.allocatedTo,
        status: 'allocated'
      });

      // Record the transaction
      projectData.materialTransactions = projectData.materialTransactions || [];
      projectData.materialTransactions.push({
        material: inventoryItem._id,
        quantity: material.quantityRequired,
        transactionType: 'deduction',
        performedBy: req.adminId
      });
    }
    projectData.materials = processedMaterials;
  }

  // Process existing data (reference: addProjectConstruction.js, lines 25-102)
  // projectData = await processExistingData(projectData);

    // Function to safely parse JSON or split string
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

    // Function to parse date strings
    const parseDate = (dateString) => {
      if (dateString) {
        return new Date(dateString);
      }
      return null;
    };

    // Handle top-level dates
    projectData.startDate = parseDate(projectData.startDate);
    projectData.estimatedCompletionDate = parseDate(projectData.estimatedCompletionDate);

    // Handle budget
    if (projectData.budget) {
      projectData.budget = {
        ...projectData.budget,
        estimatedBudget: Number(projectData.budget.estimatedBudget),
        costBreakdown: Object.entries(projectData.budget.costBreakdown).reduce((acc, [key, value]) => {
          acc[key] = Number(value);
          return acc;
        }, {})
      };
    }

    // Handle projectScope
    if (projectData.projectScope) {
      ['objectives', 'deliverables', 'exclusions'].forEach(field => {
        if (projectData.projectScope[field]) {
          projectData.projectScope[field] = safeParseOrSplit(projectData.projectScope[field]);
        }
      });
    }

    // Handle projectTeam
    if (projectData.projectTeam) {
      ['teamMembers', 'subcontractors'].forEach(field => {
        if (projectData.projectTeam[field]) {
          projectData.projectTeam[field] = safeParseOrSplit(projectData.projectTeam[field]);
        }
      });
    }

    // Handle timeline
    if (projectData.timeline) {
      if (projectData.timeline.projectSchedule) {
        projectData.timeline.projectSchedule.startDate = parseDate(projectData.timeline.projectSchedule.startDate);
        projectData.timeline.projectSchedule.endDate = parseDate(projectData.timeline.projectSchedule.endDate);
      }
      if (projectData.timeline.milestones) {
        projectData.timeline.milestones = safeParseOrSplit(projectData.timeline.milestones).map(milestone => ({
          ...milestone,
          date: parseDate(milestone.date)
        }));
      }
    }

    // Handle risks
    if (projectData.risks) {
      projectData.risks = safeParseOrSplit(projectData.risks);
    }

    // Handle resources
    if (projectData.resources) {
      projectData.resources = safeParseOrSplit(projectData.resources).map(resource => ({
        ...resource,
        quantity: Number(resource.quantity),
        unitCost: Number(resource.unitCost)
      }));
    }

    // Handle communication
    if (projectData.communication && projectData.communication.stakeholders) {
      projectData.communication.stakeholders = safeParseOrSplit(projectData.communication.stakeholders);
    }

    const newProject = new ProjectC(projectData);
    
    // Handle file uploads (if any)
    if (req.files) {
      newProject.documentation = {};
      for (const [fieldName, files] of Object.entries(req.files)) {
        const docType = fieldName.split('[')[1].split(']')[0];
        const uploadedUrls = await Promise.all(
          files.map(async (file) => {
            const url = await uploadFileToFirebase(file.buffer, file.originalname);
            return url;
          })
        );
        newProject.documentation[docType] = uploadedUrls;
      }
    }

    // Set adminId
    newProject.adminId = req.adminId;

    await newProject.save();

    // Update wallet
    await updateWallet(req.adminId, projectData);

    res.status(201).json({
      message: 'Project created successfully',
      project: newProject
    });
    console.log(newProject);
  } catch (error) {
    console.error('Error in addProjectConstruction:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Validation Error', details: error.message });
    }
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Duplicate project name or vendor email' });
    }
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

const updateWallet = async (adminId, projectData) => {
  try {
    let wallet = await Wallet.findOne({ AdminID: adminId });
    
    if (!wallet) {
      wallet = new Wallet({ AdminID: adminId });
    }

    // Calculate total expenses from budget
    let totalExpenses = 0;
    if (projectData.budget && projectData.budget.costBreakdown) {
      totalExpenses = Object.values(projectData.budget.costBreakdown).reduce((sum, cost) => sum + Number(cost), 0);
    }

    // Add expenses from resources
    if (projectData.resources) {
      totalExpenses += projectData.resources.reduce((sum, resource) => {
        return sum + (Number(resource.quantity) * Number(resource.unitCost));
      }, 0);
    }

    // Update wallet
    wallet.TotalExpenses = (Number(wallet.TotalExpenses) + totalExpenses).toString();
    wallet.TotalOrders = (Number(wallet.TotalOrders) + 1).toString();
    
    // Recalculate Profit
    wallet.Profit = (Number(wallet.TotalRevenue) - Number(wallet.TotalExpenses)).toString();

    await wallet.save();
  } catch (error) {
    console.error('Error updating wallet:', error);
  }
};

module.exports = { addProjectConstruction };