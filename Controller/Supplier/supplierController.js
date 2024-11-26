const SibApiV3Sdk = require('sib-api-v3-sdk');
const Supplier = require('../../Model/supplierSchema');
const bcrypt = require('bcryptjs');

function generateRandomPassword(length = 10) {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
  return Array.from(crypto.getRandomValues(new Uint32Array(length)))
    .map(x => charset[x % charset.length])
    .join('');
}

// Create Supplier
const addSupplier = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      address,
      companyName,
      supplierType,
      paymentTerms,
      creditLimit,
      customProperties
    } = req.body;

    // Validate required fields
    if (!name || !email || !supplierType) {
      return res.status(400).json({ 
        message: 'Name, email, and supplier type are required fields' 
      });
    }

    const password = generateRandomPassword();
    const hashedPassword = await bcrypt.hash(password, 10);

    const newSupplier = new Supplier({
      adminId: req.adminId,
      name,
      contactInformation: {
        email,
        phone,
        address,
        companyName
      },
      supplierType,
      paymentTerms,
      creditLimit,
      password: hashedPassword,
      customProperties: customProperties || []
    });

    const savedSupplier = await newSupplier.save();

    // SendinBlue email configuration
    const defaultClient = SibApiV3Sdk.ApiClient.instance;
    const apiKey = defaultClient.authentications['api-key'];
    apiKey.apiKey = process.env.SENDINBLUE_API_KEY;

    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

    sendSmtpEmail.subject = 'Your Supplier Account Details';
    sendSmtpEmail.htmlContent = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; }
            .container { padding: 20px; }
            .header { color: #333333; }
            .details { margin: 20px 0; }
            .footer { color: #666666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2 class="header">Welcome to Our Platform!</h2>
            <div class="details">
              <p>Your supplier account has been created successfully.</p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Password:</strong> ${password}</p>
              <p>Please change your password after your first login.</p>
            </div>
            <div class="footer">
              <p>This is an automated message, please do not reply.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    sendSmtpEmail.sender = {
      name: 'CRM',
      email: 'noreply@crm.com'
    };

    sendSmtpEmail.to = [{
      email: email,
      name: name
    }];

    try {
      await apiInstance.sendTransacEmail(sendSmtpEmail);
      res.status(201).json({
        message: 'Supplier created and email sent successfully',
        supplier: {
          id: savedSupplier._id,
          name: savedSupplier.name,
          email: savedSupplier.contactInformation.email
        }
      });
    } catch (emailError) {
      console.error('Error sending email:', emailError);
      res.status(201).json({
        message: 'Supplier created successfully, but email could not be sent',
        supplier: {
          id: savedSupplier._id,
          name: savedSupplier.name,
          email: savedSupplier.contactInformation.email
        },
        tempPassword: password
      });
    }

  } catch (error) {
    console.error('Error creating supplier:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        message: 'Validation error', 
        errors: Object.values(error.errors).map(err => err.message) 
      });
    }
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'A supplier with this email already exists' 
      });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get all suppliers
const getSuppliers = async (req, res) => {
  try {
    const { search, customPropertyFilter, supplierType, status } = req.body;
    const adminId = req.adminId;

    let query = { adminId: adminId };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { 'contactInformation.email': { $regex: search, $options: 'i' } },
        { 'contactInformation.companyName': { $regex: search, $options: 'i' } },
        { 'customProperties.propertyName': { $regex: search, $options: 'i' } },
        { 'customProperties.value': { $regex: search, $options: 'i' } }
      ];
    }

    if (supplierType) {
      query.supplierType = supplierType;
    }

    if (status) {
      query.status = status;
    }

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

    const suppliers = await Supplier.find(query);
    res.status(200).json(suppliers);

  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Update supplier
const updateSupplier = async (req, res) => {
  try {
    const { 
      supplierId,
      name,
      email,
      phone,
      address,
      companyName,
      supplierType,
      paymentTerms,
      creditLimit,
      status,
      customProperties
    } = req.body;

    const supplier = await Supplier.findOne({ 
      _id: supplierId, 
      adminId: req.adminId 
    });

    if (!supplier) {
      return res.status(404).json({ 
        message: 'Supplier not found or not authorized' 
      });
    }

    // Update fields if provided
    if (name) supplier.name = name;
    if (email) supplier.contactInformation.email = email;
    if (phone) supplier.contactInformation.phone = phone;
    if (address) supplier.contactInformation.address = address;
    if (companyName) supplier.contactInformation.companyName = companyName;
    if (supplierType) supplier.supplierType = supplierType;
    if (paymentTerms) supplier.paymentTerms = paymentTerms;
    if (creditLimit) supplier.creditLimit = creditLimit;
    if (status) supplier.status = status;
    if (customProperties) supplier.customProperties = customProperties;

    await supplier.save();

    res.status(200).json({
      message: 'Supplier updated successfully',
      supplier
    });

  } catch (error) {
    console.error('Error updating supplier:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Delete supplier
const deleteSupplier = async (req, res) => {
  try {
    const { supplierId } = req.body;
    
    const supplier = await Supplier.findOne({ 
      _id: supplierId, 
      adminId: req.adminId 
    });

    if (!supplier) {
      return res.status(404).json({ 
        message: 'Supplier not found or not authorized' 
      });
    }

    await Supplier.deleteOne({ _id: supplierId });

    res.status(200).json({ 
      message: 'Supplier deleted successfully' 
    });

  } catch (error) {
    console.error('Error deleting supplier:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  addSupplier,
  getSuppliers,
  updateSupplier,
  deleteSupplier
}; 