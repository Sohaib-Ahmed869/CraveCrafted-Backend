const express = require('express');
const { body } = require('express-validator');
const contactController = require('../Controllers/ContactController');
const router = express.Router();
const { authenticateToken } = require('../Middleware/AuthMiddleware');

// Validation middleware
const validateContactForm = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters')
    .escape(),
  
  body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('phone')
    .optional({ nullable: true, checkFalsy: true })
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  
  body('subject')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Subject must be between 5 and 200 characters')
    .escape(),
  
  body('message')
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Message must be between 10 and 2000 characters')
    .escape(),
  
  body('source')
    .optional()
    .trim()
    .escape()
];

const validateContactUpdate = [
  body('status')
    .optional()
    .isIn(['new', 'read', 'in_progress', 'responded', 'closed'])
    .withMessage('Invalid status value'),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Invalid priority value'),
  
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters')
    .escape()
];

const validateReply = [
  body('replyMessage')
    .trim()
    .isLength({ min: 10, max: 5000 })
    .withMessage('Reply message must be between 10 and 5000 characters'),
  
  body('replySubject')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Reply subject cannot exceed 200 characters')
    .escape()
];

const validateBulkUpdate = [
  body('contactIds')
    .isArray({ min: 1 })
    .withMessage('Contact IDs array is required and must not be empty'),
  
  body('contactIds.*')
    .isMongoId()
    .withMessage('Invalid contact ID format'),
  
  body('updateData.status')
    .optional()
    .isIn(['new', 'read', 'in_progress', 'responded', 'closed'])
    .withMessage('Invalid status value'),
  
  body('updateData.priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Invalid priority value')
];

// Rate limiting middleware (optional)
const rateLimit = require('express-rate-limit');



router.post('/submit', validateContactForm, contactController.createContact);

router.use(authenticateToken);

router.get('/', contactController.getAllContacts);

router.get('/dashboard/stats', contactController.getDashboardStats);

// Get single contact by ID
router.get('/:id', contactController.getContactById);

// Update contact
router.put('/:id', validateContactUpdate, contactController.updateContact);

// Reply to contact
router.post('/:id/reply', validateReply, contactController.replyToContact);

// Soft delete contact
router.delete('/:id', contactController.deleteContact);

// Permanently delete contact
router.delete('/:id/permanent', contactController.permanentDeleteContact);

// Bulk operations
router.patch('/bulk/update', validateBulkUpdate, contactController.bulkUpdateContacts);
module.exports = router;
