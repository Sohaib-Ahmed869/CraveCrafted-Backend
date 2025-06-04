const express = require('express');
const router = express.Router();
const User = require('../Models/Users');

const {
  register,
  login,
  googleLogin,
  getProfile,
  updateProfile,
  changePassword,
  getAllUsers
} = require('../Controllers/UserController');
const {
  authenticateToken,
  requireAdmin,
  requireOwnershipOrAdmin
} = require('../Middleware/AuthMiddleware');

router.post('/register', register);
router.post('/login', login);
router.post('/google-login', googleLogin);

router.get('/profile', authenticateToken, getProfile);
router.put('/profile', authenticateToken, updateProfile);
router.put('/change-password', authenticateToken, changePassword);

router.get('/all', authenticateToken, requireAdmin, getAllUsers);

router.get('/:userId', authenticateToken, requireOwnershipOrAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    
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
      message: 'User retrieved successfully',
      data: {
        user: userResponse
      }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Route to update user status (admin only)
router.put('/:userId/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const { userId } = req.params;

    if (!status || !['active', 'inactive', 'suspended', 'deleted'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Valid status is required (active, inactive, suspended, deleted)'
      });
    }

    const User = require('../models/User'); // Adjust path as needed
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { status },
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
      message: 'User status updated successfully',
      data: {
        user: userResponse
      }
    });

  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Route to update user role (admin only)
router.put('/:userId/role', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    const { userId } = req.params;

    if (!role || !['customer', 'admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Valid role is required (customer, admin)'
      });
    }

    const User = require('../models/User'); // Adjust path as needed
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { role },
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
      message: 'User role updated successfully',
      data: {
        user: userResponse
      }
    });

  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;