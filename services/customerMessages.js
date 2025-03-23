const ebayAPI = require('../api/ebay');
const logger = require('../utils/logger');
const db = require('../db/database');
const { generateResponse } = require('../utils/responseGenerator');
const config = require('../config/config');

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
      logger.info(`Found ${messages.length} new messages`);
      
      // Update last check time
      this.lastCheckTime = new Date();
      
      // Process each message
      for (const message of messages) {
        await this.handleMessage(message);
        
        // Small delay between processing messages
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
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
    // Implementation depends on notification system (email, SMS, etc.)
    // This is a placeholder
    logger.info(`Admin notification for message ${message.messageId} would be sent here`);
    
    // In a real implementation, you might use a notification service
    // e.g., sendEmail, sendSlackMessage, etc.
  }
}

const customerMessageHandler = new CustomerMessageHandler();
module.exports = { customerMessageHandler };