const User = require('../Models/Users'); 
const bcrypt = require('bcryptjs');
const { generateToken } = require('../Middleware/AuthMiddleware');
const Review = require('../Models/Review');
const Order = require('../Models/Order');

const register = async (req, res) => {
    try {
      const { name, email, password, confirmPassword, role } = req.body;
  
      if (!name || !email || !password || !confirmPassword) {
        return res.status(400).json({
          success: false,
          message: 'Name, email, password, and confirmPassword are all required'
        });
      }
  
      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 8 characters long'
        });
      }
  
      if (password !== confirmPassword) {
        return res.status(400).json({
          success: false,
          message: 'Password and confirmPassword do not match'
        });
      }
  
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'User with this email already exists'
        });
      }
  
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
  
      const newUser = new User({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        role: role || 'user',
        status: 'active'
      });
      const savedUser = await newUser.save();
      const token = generateToken(savedUser._id, savedUser.role);
  
      const userResponse = savedUser.toObject();
      delete userResponse.password;
  
      return res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          user: userResponse,
          token,
        }
      });
  
    } catch (error) {
      console.error('Registration error:', error);
  
      // Handle Mongoose validation errors
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => err.message);
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: messages
        });
      }
  
      // Handle duplicate‐key errors (e.g., unique email violation)
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: 'Email already exists'
        });
      }
  
      return res.status(500).json({
        success: false,
        message: 'Internal server error during registration'
      });
    }
  };
  

  const login = async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ 
          success: false, 
          message: 'Email and password are required' 
        });
      }
  
      const normalizedEmail = email.toLowerCase().trim();
      const rawPassword = password.trim();
      
      console.log("🔐 Login attempt:");
      console.log("Email:", normalizedEmail);
      console.log("Password length:", rawPassword.length);
  
      // Fetch user including the password field
      const user = await User
        .findOne({ email: normalizedEmail, status: 'active' })
        .select('+password');
      
      console.log("User found:", !!user);
      
      if (!user) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid email or password' 
        });
      }
  
      console.log("User has password:", !!user.password);
      console.log("Password starts with $2:", user.password?.startsWith('$2'));
  
      // Use the model's comparePassword method
      const isMatch = await user.comparePassword(rawPassword);
      
      if (!isMatch) {
        console.log("❌ Password comparison failed");
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid email or password' 
        });
      }
  
      console.log("✅ Password comparison successful");
  
      // FIXED: Update last login using findByIdAndUpdate to avoid triggering pre-save
      await User.findByIdAndUpdate(
        user._id, 
        { lastLogin: new Date() },
        { validateBeforeSave: false } // This prevents validation and pre-save hooks
      );
  
      // Generate token
      const token = generateToken(user._id, user.role);
      const payload = user.toObject();
      delete payload.password;
  
      return res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          user: payload,
          token,
          tokenType: 'Bearer'
        }
      });
  
    } catch (err) {
      console.error('❌ Login error:', err);
      return res.status(500).json({ 
        success: false, 
        message: 'Internal server error during login' 
      });
    }
  };
  
  

const googleLogin = async (req, res) => {
  try {
    const { googleId, email, name } = req.body;

    if (!googleId || !email) {
      return res.status(400).json({
        success: false,
        message: 'Google ID and email are required'
      });
    }

    // Find user by email or Google ID
    let user = await User.findOne({
      $or: [
        { email: email.toLowerCase().trim() },
        { 'socialLogin.google.id': googleId }
      ]
    });

    if (user) {
      // Update existing user's Google info if needed
      if (!user.socialLogin.enabled) {
        user.socialLogin.enabled = true;
        user.socialLogin.google.id = googleId;
        user.socialLogin.google.email = email;
      }
      user.lastLogin = new Date();
      await user.save();
    } else {
      // Create new user
      user = new User({
        name: name || 'Google User',
        email: email.toLowerCase().trim(),
        socialLogin: {
          enabled: true,
          google: {
            id: googleId,
            email: email
          }
        },
        status: 'active',
        role: 'user',
        lastLogin: new Date()
      });
      await user.save();
    }

    // Generate token
    const token = generateToken(user._id, user.role);

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(200).json({
      success: true,
      message: 'Google login successful',
      data: {
        user: userResponse,
        token: token,
        tokenType: 'Bearer'
      }
    });

  } catch (error) {
    console.error('Google login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during Google login',
      error: error.message
    });
  }
};

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(200).json({
      success: true,
      message: 'Profile retrieved successfully',
      data: {
        user: userResponse
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const { name, email, firstName, lastName, phone, dateOfBirth, gender, dietaryPreferences, allergies } = req.body;
    const userId = req.user._id;

    // Build update object
    const updateData = {};
    if (name) updateData.name = name.trim();
    if (email) updateData.email = email.toLowerCase().trim();
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (phone !== undefined) updateData.phone = phone;
    if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth;
    if (gender !== undefined) updateData.gender = gender;
    if (dietaryPreferences !== undefined) updateData.dietaryPreferences = Array.isArray(dietaryPreferences) ? dietaryPreferences : [];
    if (allergies !== undefined) updateData.allergies = Array.isArray(allergies) ? allergies : [];

    // Check if email is already taken by another user
    if (email) {
      const existingUser = await User.findOne({ 
        email: email.toLowerCase().trim(),
        _id: { $ne: userId }
      });
      
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'Email is already taken by another user'
        });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userResponse = updatedUser.toObject();
    delete userResponse.password;

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: userResponse
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: messages
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long'
      });
    }

    // Get user with password
    const user = await User.findById(userId).select('+password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user has a password (not social login only)
    if (!user.password) {
      return res.status(400).json({
        success: false,
        message: 'Cannot change password for social login accounts'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await User.findByIdAndUpdate(userId, { 
      password: hashedNewPassword 
    });

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get all users (Admin only)
const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, role, search } = req.query;
    
    // Build filter object
    const filter = {};
    if (status) filter.status = status;
    if (role) filter.role = role;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get users
    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const totalUsers = await User.countDocuments(filter);
    const totalPages = Math.ceil(totalUsers / parseInt(limit));

    res.status(200).json({
      success: true,
      message: 'Users retrieved successfully',
      data: {
        users,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalUsers,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get total users count excluding admins
const getTotalUsersCount = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: 'user' });
    
    res.status(200).json({
      success: true,
      message: 'Total users count retrieved successfully',
      data: {
        totalUsers
      }
    });

  } catch (error) {
    console.error('Get total users count error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get all non-admin users
const getAllNonAdminUsers = async (req, res) => {
  try {
    const { status, search } = req.query;
    
    // Build filter object - exclude admin users
    const filter = { role: { $ne: 'admin' } };
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Get all non-admin users
    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: 'Non-admin users retrieved successfully',
      data: {
        users,
        totalUsers: users.length
      }
    });

  } catch (error) {
    console.error('Get non-admin users error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get individual customer details
const getCustomerDetails = async (req, res) => {
  try {
    const { customerId } = req.params;

    // Get customer details
    const customer = await User.findOne({
      _id: customerId,
      role: { $ne: 'admin' }
    }).select('-password');

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Get customer's reviews
    const reviews = await Review.find({ userId: customerId })
      .populate('productId', 'title image')
      .sort({ createdAt: -1 });

    // Get customer's orders
    const orders = await Order.find({ user: customerId })
      .populate('orderItems.product', 'title image')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: 'Customer details retrieved successfully',
      data: {
        customer,
        reviews,
        orders
      }
    });

  } catch (error) {
    console.error('Get customer details error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid customer ID format'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Address management controllers
const getAddresses = async (req, res) => {
  console.log('getAddresses route hit');
  console.log('req.user:', req.user);
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      console.log('User not found for userId:', req.user._id);
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.status(200).json({ success: true, addresses: user.addresses || [] });
  } catch (error) {
    console.error('Error in getAddresses:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const addAddress = async (req, res) => {
  try {
    const { name, street, city, state, zipCode, country, isDefault } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Address name is required' });
    }
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (isDefault) {
      user.addresses.forEach(addr => { addr.isDefault = false; });
    }
    user.addresses.push({ name, street, city, state, zipCode, country, isDefault: !!isDefault });
    await user.save();
    res.status(201).json({ success: true, addresses: user.addresses });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateAddress = async (req, res) => {
  try {
    const { addressId } = req.params;
    const { name, street, city, state, zipCode, country, isDefault } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const address = user.addresses.id(addressId);
    if (!address) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }
    if (isDefault) {
      user.addresses.forEach(addr => { addr.isDefault = false; });
    }
    if (name !== undefined) address.name = name;
    if (street !== undefined) address.street = street;
    if (city !== undefined) address.city = city;
    if (state !== undefined) address.state = state;
    if (zipCode !== undefined) address.zipCode = zipCode;
    if (country !== undefined) address.country = country;
    if (isDefault !== undefined) address.isDefault = !!isDefault;
    await user.save();
    res.status(200).json({ success: true, addresses: user.addresses });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const deleteAddress = async (req, res) => {
  try {
    const { addressId } = req.params;
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const address = user.addresses.id(addressId);
    if (!address) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }
    address.remove();
    await user.save();
    res.status(200).json({ success: true, addresses: user.addresses });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const setDefaultAddress = async (req, res) => {
  try {
    const { addressId } = req.params;
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    let found = false;
    user.addresses.forEach(addr => {
      if (addr._id.toString() === addressId) {
        addr.isDefault = true;
        found = true;
      } else {
        addr.isDefault = false;
      }
    });
    if (!found) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }
    await user.save();
    res.status(200).json({ success: true, addresses: user.addresses });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// SUPERADMIN: Register a new admin
const registerAdmin = async (req, res) => {
  try {
    const { name, email, password} = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email and password are all required'
      });
    }
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists'
      });
    }
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const newAdmin = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: 'admin',
      status: 'active'
    });
    const savedAdmin = await newAdmin.save();
    const adminResponse = savedAdmin.toObject();
    delete adminResponse.password;
    return res.status(201).json({
      success: true,
      message: 'Admin registered successfully',
      data: { admin: adminResponse }
    });
  } catch (error) {
    console.error('Register admin error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: messages
      });
    }
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Email already exists'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Internal server error during admin registration'
    });
  }
};

// SUPERADMIN: Delete an admin
const deleteAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;
    const admin = await User.findOne({ _id: adminId, role: 'admin' });
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }
    await User.deleteOne({ _id: adminId });
    return res.status(200).json({
      success: true,
      message: 'Admin deleted successfully'
    });
  } catch (error) {
    console.error('Delete admin error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during admin deletion'
    });
  }
};

// SUPERADMIN: Get all admins
const getAllAdmins = async (req, res) => {
  try {
    const admins = await User.find({ role: 'admin' })
      .select('_id name email role isTemporaryPassword status lastLogin createdAt updatedAt')
      .sort({ createdAt: -1 });
    const adminList = admins.map(admin => ({
      _id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      status: admin.status,
      lastLogin: admin.lastLogin,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt
    }));
    return res.status(200).json({
      success: true,
      message: 'Admins retrieved successfully',
      data: adminList
    });
  } catch (error) {
    console.error('Get all admins error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching admins'
    });
  }
};

// SUPERADMIN: Register a new superadmin (for initial setup or protected use)
const registerSuperAdmin = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email and password are all required'
      });
    }
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists'
      });
    }
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const newSuperAdmin = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: 'superadmin',
      status: 'active'
    });
    const savedSuperAdmin = await newSuperAdmin.save();
    const superAdminResponse = savedSuperAdmin.toObject();
    delete superAdminResponse.password;
    const token = generateToken(savedSuperAdmin._id, savedSuperAdmin.role);
    return res.status(201).json({
      success: true,
      message: 'Superadmin registered successfully',
      data: { superadmin: superAdminResponse, token, tokenType: 'Bearer' }
    });
  } catch (error) {
    console.error('Register superadmin error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: messages
      });
    }
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Email already exists'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Internal server error during superadmin registration'
    });
  }
};

module.exports = {
  register,
  login,
  googleLogin,
  getProfile,
  updateProfile,
  changePassword,
  getAllUsers,
  getTotalUsersCount,
  getAllNonAdminUsers,
  getCustomerDetails,
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  registerAdmin,
  deleteAdmin,
  getAllAdmins,
  registerSuperAdmin
};