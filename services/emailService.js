const nodemailer = require('nodemailer');
const config = require('../config/config');
const logger = require('../utils/logger');

class EmailService {
  constructor() {
    this.initialized = false;
    this.transporter = null;
    
    // Initialize if email is enabled
    if (config.email.enabled) {
      this.init();
    } else {
      logger.warn('Email service is disabled. Set EMAIL_ENABLED=true to enable.');
    }
  }
  
  init() {
    try {
      // Create transporter
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: 'olorunfunminiyiakinlua@student.oauife.edu.ng', // Your email address
          pass: 'wtnhtyylsflevyti' // Your email password or app password
        }
      });      
      
      this.initialized = true;
      logger.info('Email service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize email service', { error: error.message });
    }
  }
  
  async sendEmail(to, subject, text, html = null, attachments = []) {
    if (!this.initialized) {
      if (config.email.enabled) {
        logger.warn('Attempting to reinitialize email service...');
        this.init();
      }
      
      if (!this.initialized) {
        logger.error('Email service not initialized, cannot send email');
        return { success: false, error: 'Email service not initialized' };
      }
    }
    
    try {
      const mailOptions = {
        from: 'olorunfunminiyiakinlua@student.oauife.edu.ng',
        to,
        subject,
        text
      };
      
      // Add HTML content if provided
      if (html) {
        mailOptions.html = html;
      }
      
      // Add attachments if provided
      if (attachments.length > 0) {
        mailOptions.attachments = attachments;
      }
      
      const info = await this.transporter.sendMail(mailOptions);
      logger.info('Email sent successfully', { messageId: info.messageId });
      
      return { success: true, messageId: info.messageId };
    } catch (error) {
      logger.error('Failed to send email', { error: error.message });
      return { success: false, error: error.message };
    }
  }
  
  async sendAdminNotification(subject, text, html = null) {
    const adminEmails = config.email.adminEmails;
    
    if (!adminEmails || adminEmails.length === 0 || (adminEmails.length === 1 && adminEmails[0] === '')) {
      logger.warn('No admin emails configured, notification not sent');
      return { success: false, error: 'No admin emails configured' };
    }
    
    return this.sendEmail(adminEmails.join(','), subject, text, html);
  }
}

const emailService = new EmailService();
module.exports = { emailService }; 