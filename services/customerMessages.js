const ebayAPI = require('../api/ebay');
const logger = require('../utils/logger');
const db = require('../db/database');
const { generateResponse } = require('../utils/responseGenerator');
const config = require('../config/config');
const { emailService } = require('./emailService');

class CustomerMessageHandler {
  constructor() {
    this.lastCheckTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // Start with messages from last 24 hours
    this.responseTimeWindow = config.customerService.responseTimeHours || 24; // Hours to respond within
    this.escalationKeywords = config.customerService.escalationKeywords || ['refund', 'broken', 'damaged', 'complaint', 'return'];
  }

  async processMessages() {
    try {
      logger.info(`Checking messages since ${this.lastCheckTime.toISOString()}`);
      
      // Get messages since last check
      const messages = await ebayAPI.getMessages(this.lastCheckTime);
      console.log("messages:", messages);
      logger.info(`Found ${messages.length} new messages`);
      
      // // Update last check time
      // this.lastCheckTime = new Date();
      
      // // Process each message
      // for (const message of messages) {
      //   await this.handleMessage(message);
        
      //   // Small delay between processing messages
      //   await new Promise(resolve => setTimeout(resolve, 500));
      // }
      
      return true;
    } catch (error) {
      logger.error('Error in customer message handler', { error: error.message });
      throw error;
    }
  }
  
  async handleMessage(message) {
    try {
      // Check if message has already been processed
      const existingMessage = await db.messages.findOne({
        messageId: message.messageId
      });
      
      if (existingMessage && existingMessage.responded) {
        logger.debug(`Message ${message.messageId} already processed, skipping`);
        return;
      }
      
      // Store message in database
      if (!existingMessage) {
        await db.messages.create({
          messageId: message.messageId,
          buyerUsername: message.sender,
          subject: message.subject,
          content: message.text,
          receivedAt: new Date(message.creationDate),
          responded: false,
          escalated: false
        });
      }
      
      // Check if message requires escalation
      const needsEscalation = this.checkForEscalation(message.text);
      
      if (needsEscalation) {
        logger.info(`Message ${message.messageId} requires escalation, flagging for manual review`);
        
        await db.messages.findOneAndUpdate(
          { messageId: message.messageId },
          { 
            escalated: true, 
            escalatedAt: new Date() 
          }
        );
        
        // Send notification to admin (implementation depends on notification system)
        this.notifyAdmin(message);
        
      } else {
        // Generate automated response
        const response = await generateResponse(message.text);
        
        // Reply to the message
        await ebayAPI.replyToMessage(message.messageId, response);
        
        // Update database record
        await db.messages.findOneAndUpdate(
          { messageId: message.messageId },
          { 
            responded: true, 
            respondedAt: new Date(), 
            response: response 
          }
        );
        
        logger.info(`Successfully responded to message ${message.messageId}`);
      }
      
    } catch (error) {
      logger.error(`Error handling message ${message.messageId}`, { error: error.message });
      
      // Mark as escalated if error occurs during processing
      await db.messages.findOneAndUpdate(
        { messageId: message.messageId },
        { 
          escalated: true, 
          escalatedAt: new Date(), 
          escalationReason: `Error: ${error.message}` 
        }
      );
    }
  }
  
  checkForEscalation(messageText) {
    // Check if message contains any escalation keywords
    messageText = messageText.toLowerCase();
    return this.escalationKeywords.some(keyword => messageText.includes(keyword.toLowerCase()));
  }
  
  notifyAdmin(message) {
    logger.info(`Sending admin notification for message ${message.messageId}`);
    
    const subject = `[eBay] Escalated Customer Message: ${message.subject || 'No subject'}`;
    
    // Prepare email content
    const text = `
      A customer message has been escalated and requires your attention.

      Message ID: ${message.messageId}
      Buyer: ${message.sender}
      Subject: ${message.subject || 'No subject'}
      Content:
      ${message.text}

      This message has been automatically escalated based on its content.
      Please review and respond appropriately.

      ---
      eBay Customer Service Bot
      `;

          // Create HTML version
          const html = `
      <h3>eBay Customer Message Escalation</h3>
      <p>A customer message has been escalated and requires your attention.</p>

      <div style="border: 1px solid #ddd; padding: 15px; margin: 15px 0; border-radius: 5px;">
        <p><strong>Message ID:</strong> ${message.messageId}</p>
        <p><strong>Buyer:</strong> ${message.sender}</p>
        <p><strong>Subject:</strong> ${message.subject || 'No subject'}</p>
        <p><strong>Content:</strong></p>
        <div style="background-color: #f9f9f9; padding: 10px; border-left: 4px solid #0070ba;">
          <pre style="white-space: pre-wrap;">${message.text}</pre>
        </div>
      </div>

      <p>This message has been automatically escalated based on its content.</p>
      <p>Please review and respond appropriately.</p>

      <hr>
      <p style="color: #777; font-size: 0.9em;">eBay Customer Service Bot</p>
      `;

    // Send the notification email
    emailService.sendAdminNotification(subject, text, html)
      .then(result => {
        if (result.success) {
          logger.info(`Admin notification email sent successfully for message ${message.messageId}`);
        } else {
          logger.warn(`Failed to send admin notification email for message ${message.messageId}`, { error: result.error });
        }
      })
      .catch(error => {
        logger.error(`Error sending admin notification email for message ${message.messageId}`, { error: error.message });
      });
  }
}

const customerMessageHandler = new CustomerMessageHandler();
module.exports = { customerMessageHandler };