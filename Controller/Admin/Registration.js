const Admin = require('../../Model/Admin');
const SuperAdmin = require('../../Model/superAdmin');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

const signin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const lowercaseEmail = email.toLowerCase();

    let user;
    let secretKey;

    // Check SuperAdmin first
    user = await SuperAdmin.findOne({ 
      Email: { $regex: new RegExp(`^${lowercaseEmail}$`, 'i') } 
    });
    
    if (user) {
      secretKey = process.env.JWT_SECRET_Super;
    } else {
      // If not SuperAdmin, check Admin
      user = await Admin.findOne({ 
        Email: { $regex: new RegExp(`^${lowercaseEmail}$`, 'i') } 
      });
      if (user) {
        secretKey = process.env.JWT_SECRET;
      }
    }

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.Password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if user is active
    // if (!user.isActive) {
    //   return res.status(403).json({ 
    //     message: 'Account is inactive. Please contact an administrator.' 
    //   });
    // }

    const token = jwt.sign(
      {
        userId: user._id,
        username: user.Name,
        email: user.Email,
        role: user.role || (user.constructor.modelName === 'SuperAdmin' ? 'superadmin' : 'admin')
      },
      secretKey,
      { expiresIn: '30d' }
    );

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    const response = {
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.Name,
        email: user.Email,
        role: user.role || (user.constructor.modelName === 'SuperAdmin' ? 'superadmin' : 'admin'),
        fullName: user.fullName || user.Name,
        department: user.department || '',
        CompanyActivity: user.CompanyActivity || 'construction'
      }
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

module.exports = { signin };
