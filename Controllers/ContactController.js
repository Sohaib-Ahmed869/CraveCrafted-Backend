const ContactUs = require('../Models/ContactUs'); 
const emailService = require("../utils/EmailService");
const { validationResult } = require('express-validator');

class ContactController {
  // Create new contact form submission
  async createContact(req, res) {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { name, email, phone, subject, message, source } = req.body;

      // Create new contact entry
      const contactData = new ContactUs({
        name,
        email,
        phone,
        subject,
        message,
        source: source || 'website_contact_form'
      });

      const savedContact = await contactData.save();

      // Send confirmation email to user and notification to admin
      try {
        await emailService.sendContactConfirmation(savedContact);
        await emailService.sendAdminNotification(savedContact);
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
        // Don't fail the request if email fails
      }

      res.status(201).json({
        success: true,
        message: 'Contact form submitted successfully',
        data: {
          id: savedContact._id,
          name: savedContact.name,
          email: savedContact.email,
          subject: savedContact.subject,
          status: savedContact.status,
          submittedAt: savedContact.submittedAt
        }
      });
    } catch (error) {
      console.error('Create contact error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to submit contact form',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  // Get all contacts with filtering and pagination
  async getAllContacts(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        status,
        priority,
        search,
        sortBy = 'submittedAt',
        sortOrder = 'desc'
      } = req.query;

      // Build filter object
      const filter = {};
      if (status) filter.status = status;
      if (priority) filter.priority = priority;
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { subject: { $regex: search, $options: 'i' } },
          { message: { $regex: search, $options: 'i' } }
        ];
      }

      // Calculate pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const sortDirection = sortOrder === 'desc' ? -1 : 1;

      // Execute query with pagination
      const [contacts, totalCount] = await Promise.all([
        ContactUs.find(filter)
          .sort({ [sortBy]: sortDirection })
          .skip(skip)
          .limit(parseInt(limit))
          .select('-__v'),
        ContactUs.countDocuments(filter)
      ]);

      const totalPages = Math.ceil(totalCount / parseInt(limit));

      res.status(200).json({
        success: true,
        data: contacts,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          limit: parseInt(limit),
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1
        }
      });
    } catch (error) {
      console.error('Get all contacts error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch contacts',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  // Get single contact by ID
  async getContactById(req, res) {
    try {
      const { id } = req.params;

      const contact = await ContactUs.findById(id).select('-__v');
      
      if (!contact) {
        return res.status(404).json({
          success: false,
          message: 'Contact not found'
        });
      }

      // Mark as read if not already read
      if (contact.status === 'new') {
        contact.status = 'read';
        contact.readAt = new Date();
        await contact.save();
      }

      res.status(200).json({
        success: true,
        data: contact
      });
    } catch (error) {
      console.error('Get contact by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch contact',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  // Update contact status and priority
  async updateContact(req, res) {
    try {
      const { id } = req.params;
      const { status, priority, notes } = req.body;

      const contact = await ContactUs.findById(id);
      
      if (!contact) {
        return res.status(404).json({
          success: false,
          message: 'Contact not found'
        });
      }

      // Update fields
      if (status) {
        contact.status = status;
        if (status === 'read' && !contact.readAt) {
          contact.readAt = new Date();
        }
        if (status === 'responded' && !contact.respondedAt) {
          contact.respondedAt = new Date();
        }
      }
      
      if (priority) contact.priority = priority;
      if (notes) contact.notes = notes;

      const updatedContact = await contact.save();

      res.status(200).json({
        success: true,
        message: 'Contact updated successfully',
        data: updatedContact
      });
    } catch (error) {
      console.error('Update contact error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update contact',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  // Delete contact (soft delete - change status to closed)
  async deleteContact(req, res) {
    try {
      const { id } = req.params;

      const contact = await ContactUs.findById(id);
      
      if (!contact) {
        return res.status(404).json({
          success: false,
          message: 'Contact not found'
        });
      }

      // Soft delete by changing status to closed
      contact.status = 'closed';
      await contact.save();

      res.status(200).json({
        success: true,
        message: 'Contact deleted successfully'
      });
    } catch (error) {
      console.error('Delete contact error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete contact',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  // Permanently delete contact (hard delete)
  async permanentDeleteContact(req, res) {
    try {
      const { id } = req.params;

      const deletedContact = await ContactUs.findByIdAndDelete(id);
      
      if (!deletedContact) {
        return res.status(404).json({
          success: false,
          message: 'Contact not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Contact permanently deleted'
      });
    } catch (error) {
      console.error('Permanent delete contact error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to permanently delete contact',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  // Get dashboard statistics
  async getDashboardStats(req, res) {
    try {
      const [
        totalContacts,
        newContacts,
        inProgressContacts,
        respondedContacts,
        urgentContacts,
        recentContacts
      ] = await Promise.all([
        ContactUs.countDocuments(),
        ContactUs.countDocuments({ status: 'new' }),
        ContactUs.countDocuments({ status: 'in_progress' }),
        ContactUs.countDocuments({ status: 'responded' }),
        ContactUs.countDocuments({ priority: 'urgent' }),
        ContactUs.find()
          .sort({ submittedAt: -1 })
          .limit(5)
          .select('name email subject status priority submittedAt')
      ]);

      // Get contacts by status for chart
      const statusStats = await ContactUs.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      // Get contacts by priority for chart
      const priorityStats = await ContactUs.aggregate([
        {
          $group: {
            _id: '$priority',
            count: { $sum: 1 }
          }
        }
      ]);

      res.status(200).json({
        success: true,
        data: {
          summary: {
            total: totalContacts,
            new: newContacts,
            inProgress: inProgressContacts,
            responded: respondedContacts,
            urgent: urgentContacts
          },
          charts: {
            byStatus: statusStats,
            byPriority: priorityStats
          },
          recentContacts
        }
      });
    } catch (error) {
      console.error('Get dashboard stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch dashboard statistics',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  // Bulk update contacts
  async bulkUpdateContacts(req, res) {
    try {
      const { contactIds, updateData } = req.body;

      if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Contact IDs array is required'
        });
      }

      const updateFields = {};
      if (updateData.status) updateFields.status = updateData.status;
      if (updateData.priority) updateFields.priority = updateData.priority;

      const result = await ContactUs.updateMany(
        { _id: { $in: contactIds } },
        { $set: updateFields }
      );

      res.status(200).json({
        success: true,
        message: `${result.modifiedCount} contacts updated successfully`,
        data: {
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount
        }
      });
    } catch (error) {
      console.error('Bulk update contacts error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to bulk update contacts',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  // Reply to contact
  async replyToContact(req, res) {
    try {
      const { id } = req.params;
      const { replyMessage, replySubject } = req.body;

      if (!replyMessage) {
        return res.status(400).json({
          success: false,
          message: 'Reply message is required'
        });
      }

      const contact = await ContactUs.findById(id);
      
      if (!contact) {
        return res.status(404).json({
          success: false,
          message: 'Contact not found'
        });
      }

      // Send reply email
      try {
        await emailService.sendReplyToContact(contact, replyMessage, replySubject);
      } catch (emailError) {
        console.error('Reply email sending failed:', emailError);
        return res.status(500).json({
          success: false,
          message: 'Failed to send reply email'
        });
      }

      // Update contact status
      contact.status = 'responded';
      contact.respondedAt = new Date();
      await contact.save();

      res.status(200).json({
        success: true,
        message: 'Reply sent successfully',
        data: contact
      });
    } catch (error) {
      console.error('Reply to contact error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send reply',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
}

module.exports = new ContactController();