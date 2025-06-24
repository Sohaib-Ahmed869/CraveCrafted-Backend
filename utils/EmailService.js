const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

class EmailService {
  constructor() {
    this.transporter = this.createTransporter();
  }

  // Create email transporter
  createTransporter() {
    // Configure based on your email provider
    return nodemailer.createTransport({
      // For Gmail
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS 
      }
      
      // For custom SMTP
      // host: process.env.SMTP_HOST,
      // port: process.env.SMTP_PORT || 587,
      // secure: false,
      // auth: {
      //   user: process.env.SMTP_USER,
      //   pass: process.env.SMTP_PASS
      // }
    });
  }

  // Send confirmation email to user
  async sendContactConfirmation(contactData) {
    try {
      const mailOptions = {
        from: {
          name: process.env.COMPANY_NAME || 'Your Company',
          address: process.env.EMAIL_FROM || process.env.EMAIL_USER
        },
        to: contactData.email,
        subject: 'Thank you for contacting us!',
        html: this.generateConfirmationEmailHTML(contactData),
        text: this.generateConfirmationEmailText(contactData)
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('Confirmation email sent:', result.messageId);
      return result;
    } catch (error) {
      console.error('Failed to send confirmation email:', error);
      throw error;
    }
  }

  // Send notification email to admin
  async sendAdminNotification(contactData) {
    try {
      const mailOptions = {
        from: {
          name: process.env.COMPANY_NAME || 'Your Company',
          address: process.env.EMAIL_FROM || process.env.EMAIL_USER
        },
        to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
        subject: `New Contact Form Submission - ${contactData.subject}`,
        html: this.generateAdminNotificationHTML(contactData),
        text: this.generateAdminNotificationText(contactData)
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('Admin notification sent:', result.messageId);
      return result;
    } catch (error) {
      console.error('Failed to send admin notification:', error);
      throw error;
    }
  }

  // Send reply to contact
  async sendReplyToContact(contactData, replyMessage, replySubject) {
    try {
      const subject = replySubject || `Re: ${contactData.subject}`;
      
      const mailOptions = {
        from: {
          name: process.env.COMPANY_NAME || 'Your Company',
          address: process.env.EMAIL_FROM || process.env.EMAIL_USER
        },
        to: contactData.email,
        subject: subject,
        html: this.generateReplyEmailHTML(contactData, replyMessage),
        text: this.generateReplyEmailText(contactData, replyMessage),
        // Add reference headers for email threading
        inReplyTo: `<contact-${contactData._id}@${process.env.DOMAIN || 'yourcompany.com'}>`,
        references: `<contact-${contactData._id}@${process.env.DOMAIN || 'yourcompany.com'}>`
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('Reply email sent:', result.messageId);
      return result;
    } catch (error) {
      console.error('Failed to send reply email:', error);
      throw error;
    }
  }

  // Generate confirmation email HTML
  generateConfirmationEmailHTML(contactData) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Thank you for contacting us</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 8px; }
          .content { padding: 20px 0; }
          .footer { background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; border-radius: 8px; }
          .highlight { background-color: #e9ecef; padding: 15px; border-radius: 5px; margin: 10px 0; }
          .priority-${contactData.priority} { border-left: 4px solid ${this.getPriorityColor(contactData.priority)}; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Thank You, ${contactData.name}!</h1>
            <p>We've received your message and will get back to you soon.</p>
          </div>
          
          <div class="content">
            <h2>Your Message Details:</h2>
            <div class="highlight priority-${contactData.priority}">
              <p><strong>Subject:</strong> ${contactData.subject}</p>
              <p><strong>Priority:</strong> ${contactData.priority.toUpperCase()}</p>
              <p><strong>Submitted:</strong> ${new Date(contactData.submittedAt).toLocaleString()}</p>
              <p><strong>Reference ID:</strong> ${contactData._id}</p>
            </div>
            
            <p><strong>Your Message:</strong></p>
            <div class="highlight">
              <p>${contactData.message.replace(/\n/g, '<br>')}</p>
            </div>
            
            <p>We typically respond within 24-48 hours. If your inquiry is urgent, please call us directly.</p>
          </div>
          
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${process.env.COMPANY_NAME || 'Your Company'}. All rights reserved.</p>
            <p>This is an automated message. Please do not reply directly to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Generate confirmation email text
  generateConfirmationEmailText(contactData) {
    return `
Thank You, ${contactData.name}!

We've received your message and will get back to you soon.

Your Message Details:
- Subject: ${contactData.subject}
- Priority: ${contactData.priority.toUpperCase()}
- Submitted: ${new Date(contactData.submittedAt).toLocaleString()}
- Reference ID: ${contactData._id}

Your Message:
${contactData.message}

We typically respond within 24-48 hours. If your inquiry is urgent, please call us directly.

© ${new Date().getFullYear()} ${process.env.COMPANY_NAME || 'Your Company'}. All rights reserved.
This is an automated message. Please do not reply directly to this email.
    `;
  }

  // Generate admin notification HTML
  generateAdminNotificationHTML(contactData) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Contact Form Submission</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #007bff; color: white; padding: 20px; text-align: center; border-radius: 8px; }
          .content { padding: 20px 0; }
          .highlight { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 10px 0; }
          .priority-urgent { border-left: 4px solid #dc3545; }
          .priority-high { border-left: 4px solid #fd7e14; }
          .priority-medium { border-left: 4px solid #ffc107; }
          .priority-low { border-left: 4px solid #28a745; }
          .action-buttons { text-align: center; margin: 20px 0; }
          .btn { display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚨 New Contact Form Submission</h1>
            <p>Priority: ${contactData.priority.toUpperCase()}</p>
          </div>
          
          <div class="content">
            <div class="highlight priority-${contactData.priority}">
              <h2>Contact Information</h2>
              <p><strong>Name:</strong> ${contactData.name}</p>
              <p><strong>Email:</strong> <a href="mailto:${contactData.email}">${contactData.email}</a></p>
              ${contactData.phone ? `<p><strong>Phone:</strong> <a href="tel:${contactData.phone}">${contactData.phone}</a></p>` : ''}
              <p><strong>Source:</strong> ${contactData.source}</p>
              <p><strong>Submitted:</strong> ${new Date(contactData.submittedAt).toLocaleString()}</p>
              <p><strong>ID:</strong> ${contactData._id}</p>
            </div>
            
            <div class="highlight">
              <h3>Subject: ${contactData.subject}</h3>
              <p><strong>Message:</strong></p>
              <p>${contactData.message.replace(/\n/g, '<br>')}</p>
            </div>
            
            <div class="action-buttons">
              <a href="${process.env.ADMIN_PANEL_URL || '#'}/contacts/${contactData._id}" class="btn">View in Admin Panel</a>
              <a href="mailto:${contactData.email}?subject=Re: ${encodeURIComponent(contactData.subject)}" class="btn">Reply via Email</a>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Generate admin notification text
  generateAdminNotificationText(contactData) {
    return `
🚨 NEW CONTACT FORM SUBMISSION
Priority: ${contactData.priority.toUpperCase()}

Contact Information:
- Name: ${contactData.name}
- Email: ${contactData.email}
${contactData.phone ? `- Phone: ${contactData.phone}` : ''}
- Source: ${contactData.source}
- Submitted: ${new Date(contactData.submittedAt).toLocaleString()}
- ID: ${contactData._id}

Subject: ${contactData.subject}

Message:
${contactData.message}

Reply to: ${contactData.email}
    `;
  }

  // Generate reply email HTML
  generateReplyEmailHTML(contactData, replyMessage) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Response to your inquiry</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 8px; }
          .content { padding: 20px 0; }
          .footer { background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; border-radius: 8px; }
          .highlight { background-color: #e9ecef; padding: 15px; border-radius: 5px; margin: 10px 0; }
          .original-message { border-left: 3px solid #ccc; padding-left: 15px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Hello ${contactData.name},</h1>
            <p>Thank you for contacting us. Here's our response to your inquiry.</p>
          </div>
          
          <div class="content">
            <div class="highlight">
              ${replyMessage.replace(/\n/g, '<br>')}
            </div>
            
            <div class="original-message">
              <h4>Your Original Message:</h4>
              <p><strong>Subject:</strong> ${contactData.subject}</p>
              <p><strong>Sent:</strong> ${new Date(contactData.submittedAt).toLocaleString()}</p>
              <p>${contactData.message.replace(/\n/g, '<br>')}</p>
            </div>
            
            <p>If you have any further questions, please don't hesitate to contact us.</p>
          </div>
          
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${process.env.COMPANY_NAME || 'Your Company'}. All rights reserved.</p>
            <p>Reference ID: ${contactData._id}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Generate reply email text
  generateReplyEmailText(contactData, replyMessage) {
    return `
Hello ${contactData.name},

Thank you for contacting us. Here's our response to your inquiry:

${replyMessage}

Your Original Message:
Subject: ${contactData.subject}
Sent: ${new Date(contactData.submittedAt).toLocaleString()}
${contactData.message}

If you have any further questions, please don't hesitate to contact us.

© ${new Date().getFullYear()} ${process.env.COMPANY_NAME || 'Your Company'}. All rights reserved.
Reference ID: ${contactData._id}
    `;
  }

  // Get priority color for styling
  getPriorityColor(priority) {
    const colors = {
      urgent: '#dc3545',
      high: '#fd7e14',
      medium: '#ffc107',
      low: '#28a745'
    };
    return colors[priority] || colors.medium;
  }

  // Test email configuration
  async testEmailConfig() {
    try {
      await this.transporter.verify();
      console.log('Email configuration is valid');
      return { success: true, message: 'Email configuration is valid' };
    } catch (error) {
      console.error('Email configuration error:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new EmailService();