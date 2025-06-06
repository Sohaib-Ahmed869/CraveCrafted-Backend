const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  try {
    // Create a transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'momoashfaq@gmail.com',
        pass: 'zpsm lfhb prdg ytje'
      }
    });

    // Verify transporter configuration
    await transporter.verify();
    console.log('SMTP connection verified successfully');

    // Define email options
    const message = {
      from: `CraveCrafted <momoashfaq@gmail.com>`,
      to: options.email,
      subject: options.subject,
      html: options.html
    };

    console.log('Attempting to send email to:', options.email);

    // Send email
    const info = await transporter.sendMail(message);

    console.log('Email sent successfully:', {
      messageId: info.messageId,
      response: info.response,
      accepted: info.accepted,
      rejected: info.rejected
    });

    return info;
  } catch (error) {
    console.error('Error sending email:', {
      error: error.message,
      stack: error.stack,
      code: error.code
    });
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

module.exports = sendEmail; 