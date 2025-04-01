
const logger = require('./logger');
const config = require('../config/config');

// Predefined response templates
const responseTemplates = {
    shipping: 'Thank you for your message about shipping. Your order will be shipped within 2-3 business days. Once shipped, you will receive a tracking number via eBay. Please allow 7-14 days for delivery depending on your location.',

    orderStatus: 'Thank you for inquiring about your order status. We\'ve received your order and it\'s currently being processed. If you have any specific questions about your order, please provide your order number and we\'ll be happy to provide more details.',

    productDetails: 'Thank you for your interest in our product. The item description includes all available information about the product specifications, dimensions, and features. If you have a specific question that isn\'t covered in the description, please let us know and we\'ll be happy to help.',

    returns: 'We accept returns within 30 days of receiving your item. To initiate a return, please go to your eBay purchase history and select "Return this item". If you need any assistance with the return process, please let us know.',

    general: 'Thank you for your message. We appreciate your interest in our products. Our customer service team will review your inquiry and get back to you within 24 hours if needed. Please let us know if you have any other questions!'
};

// Function to generate response based on message content
const generateResponse = async (messageText) => {
    try {
        messageText = messageText.toLowerCase();

        // Check for keywords to determine the appropriate response
        if (messageText.includes('ship') || messageText.includes('delivery') || messageText.includes('tracking')) {
            return responseTemplates.shipping;
        }

        if (messageText.includes('order') || messageText.includes('status') || messageText.includes('purchase')) {
            return responseTemplates.orderStatus;
        }

        if (messageText.includes('spec') || messageText.includes('dimension') || messageText.includes('feature') ||
            messageText.includes('detail') || messageText.includes('information')) {
            return responseTemplates.productDetails;
        }

        if (messageText.includes('return') && !containsEscalationKeywords(messageText)) {
            return response
        }


        if (messageText.includes('return') && !containsEscalationKeywords(messageText)) {
            return responseTemplates.returns;
        }

        // Default to general response if no specific keywords are found
        return responseTemplates.general;

    } catch (error) {
        logger.error('Error generating response', { error: error.message });
        return responseTemplates.general; // Fallback to general response
    }
};

// Helper function to check for escalation keywords
const containsEscalationKeywords = (text) => {
    const escalationKeywords = config.customerService.escalationKeywords ||
        ['refund', 'broken', 'damaged', 'complaint', 'return', 'not working'];

    return escalationKeywords.some(keyword => text.includes(keyword.toLowerCase()));
};

module.exports = { generateResponse };

// config/config.js - Application configuration
