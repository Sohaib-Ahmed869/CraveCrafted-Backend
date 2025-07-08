const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../Models/Users');
const { authenticateToken } = require('../Middleware/AuthMiddleware');
const sendEmail = require('../utils/sendEmail');
const crypto = require('crypto');

// Validation middleware
const validateRegistration = [
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long'),
  body('name').notEmpty().withMessage('Name is required')
];

const validateLogin = [
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('password').notEmpty().withMessage('Password is required')
];

const validateResetPassword = [
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/\d/)
    .withMessage('Password must contain at least one number')
    .matches(/[a-z]/)
    .withMessage('Password must contain at least one lowercase letter')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
];

// @route   POST /api/auth/register
// @desc    Register a new user
router.post('/register', validateRegistration, async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Registration validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, name, role } = req.body;
    console.log('Registration attempt for email:', email);

    // Check if user exists
    let user = await User.findOne({ email: email.toLowerCase().trim() });
    console.log('Existing user check result:', user ? 'User found' : 'No user found');
    
    if (user) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Create user
    user = new User({
      email: email.toLowerCase().trim(),
      password,
      name,
      role: role || 'user'
    });

    await user.save();
    console.log('New user created successfully:', user.email);

    // Generate token
    const token = user.generateAuthToken();

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        },
        token
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
router.post('/login', validateLogin, async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Login validation errors:', errors.array());
      return res.status(400).json({ 
        success: false,
        message: 'Validation failed',
        errors: errors.array() 
      });
    }

    const { email, password } = req.body;
    console.log('Login attempt for email:', email);

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Check for user
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
    console.log('User lookup result:', user ? 'User found' : 'No user found');
    
    if (!user) {
      console.log('User not found for email:', email);
      return res.status(400).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (user.status !== 'active') {
      console.log('Inactive account for email:', email);
      return res.status(400).json({
        success: false,
        message: 'Account is not active'
      });
    }

    // Check password
    try {
      console.log('Attempting password comparison...');
      const isMatch = await user.comparePassword(password);
      console.log('Password match result:', isMatch ? 'Password matches' : 'Password does not match');
      
      if (!isMatch) {
        console.log('Invalid password for user:', email);
        return res.status(400).json({
          success: false,
          message: 'Invalid email or password'
        });
      }
    } catch (error) {
      console.error('Password comparison error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error verifying password'
      });
    }

    // Check if password change is required
    if (user.isTemporaryPassword) {
      return res.status(200).json({
        success: true,
        data: {
          userId: user._id,
          passwordChangeRequired: true
        }
      });
    }

    // Update last login
    user.lastLogin = Date.now();
    await user.save();

    // Generate token
    const token = user.generateAuthToken();

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        },
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Forgot password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    console.log('Forgot password request for email:', email);

    if (!email) {
      console.log('No email provided in request');
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    console.log('User lookup result:', user ? 'User found' : 'No user found');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No user found with that email'
      });
    }

    // Get reset token
    console.log('Generating reset token for user:', user.email);
    const resetToken = user.getResetPasswordToken();

    await user.save({ validateBeforeSave: false });
    console.log('Reset token saved for user:', user.email);

    // Create reset url
    const resetUrl = `https://crave-crafe-frontend.vercel.app/reset-password/${resetToken}`;
    console.log('Reset URL generated:', resetUrl);

    const message = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #AFC437; margin: 0;">CraveCrafted</h1>
          <p style="color: #666; margin: 10px 0;">Password Reset Request</p>
        </div>
        
        <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
          <p style="margin: 0 0 15px 0;">Hello ${user.name},</p>
          <p style="margin: 0 0 15px 0;">We received a request to reset your password. Click the button below to create a new password:</p>
          
          <div style="text-align: center; margin: 25px 0;">
            <a href="${resetUrl}" 
               style="background-color: #AFC437; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Reset Password
            </a>
          </div>
          
          <p style="margin: 0 0 15px 0;">Or copy and paste this link in your browser:</p>
          <p style="margin: 0; word-break: break-all; color: #666;">
            <a href="${resetUrl}" style="color: #AFC437;">${resetUrl}</a>
          </p>
        </div>
        
        <div style="text-align: center; color: #666; font-size: 12px;">
          <p style="margin: 0;">This link will expire in 10 minutes.</p>
          <p style="margin: 5px 0 0 0;">If you didn't request this, please ignore this email.</p>
        </div>
      </div>
    `;

    try {
      console.log('Attempting to send reset password email to:', user.email);
      await sendEmail({
        email: user.email,
        subject: 'CraveCrafted - Password Reset Request',
        html: message
      });
      console.log('Reset password email sent successfully to:', user.email);

      res.json({
        success: true,
        message: 'Password reset link has been sent to your email'
      });
    } catch (err) {
      console.error('Error sending reset password email:', err);
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;

      await user.save({ validateBeforeSave: false });
      console.log('Reset token cleared due to email error');

      return res.status(500).json({
        success: false,
        message: 'Email could not be sent'
      });
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/auth/reset-password/:resetToken
// @desc    Reset password
router.put('/reset-password/:resetToken', validateResetPassword, async (req, res) => {
  try {
    // Get hashed token
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(req.params.resetToken)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    // Set new password
    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Password reset successful'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router; 