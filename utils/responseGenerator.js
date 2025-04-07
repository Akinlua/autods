const logger = require('./logger');
const config = require('../config/config');
const fs = require('fs');
const path = require('path');

// Default response templates (only used as fallback)
const defaultTemplates = {
    shipping: 'Thank you for your message about shipping. Your order will be shipped within 2-3 business days. Once shipped, you will receive a tracking number via eBay. Please allow 7-14 days for delivery depending on your location.',

    orderStatus: 'Thank you for inquiring about your order status. We\'ve received your order and it\'s currently being processed. If you have any specific questions about your order, please provide your order number and we\'ll be happy to provide more details.',

    productDetails: 'Thank you for your interest in our product. The item description includes all available information about the product specifications, dimensions, and features. If you have a specific question that isn\'t covered in the description, please let us know and we\'ll be happy to help.',

    returns: 'We accept returns within 30 days of receiving your item. To initiate a return, please go to your eBay purchase history and select "Return this item". If you need any assistance with the return process, please let us know.',

    general: 'Thank you for your message. We appreciate your interest in our products. Our customer service team will review your inquiry and get back to you within 24 hours if needed. Please let us know if you have any other questions!'
};

// Response templates to be used by the application
let responseTemplates = { ...defaultTemplates };

// Path to the JSON templates file
const templatesFilePath = path.join(__dirname, '../data/responseTemplates.json');

// Load templates from JSON file
const loadTemplatesFromFile = () => {
    try {
        if (fs.existsSync(templatesFilePath)) {
            const savedTemplates = JSON.parse(fs.readFileSync(templatesFilePath, 'utf8'));
            
            // If the JSON file exists, completely replace the templates with its content
            responseTemplates = savedTemplates;
            
            // Check if all required template types exist, if not add the missing ones from defaults
            for (const key in defaultTemplates) {
                if (!responseTemplates[key]) {
                    responseTemplates[key] = defaultTemplates[key];
                    logger.info(`Added missing template: ${key} from defaults`);
                }
            }
            
            logger.info('Loaded response templates from JSON file');
            return true;
        } else {
            // If no file exists, create one with the default templates
            saveTemplatesToFile(defaultTemplates);
            logger.info('Created new response templates file with defaults');
            return false;
        }
    } catch (error) {
        logger.error('Error loading templates from file', { error: error.message });
        return false;
    }
};

// Save templates to JSON file
const saveTemplatesToFile = (templates) => {
    try {
        // Ensure data directory exists
        const dataDir = path.join(__dirname, '../data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        // Write templates to file
        fs.writeFileSync(templatesFilePath, JSON.stringify(templates, null, 2));
        return true;
    } catch (error) {
        logger.error('Error saving templates to file', { error: error.message });
        return false;
    }
};

// Initialize by loading templates from file
loadTemplatesFromFile();

// Function to check if message contains escalation keywords
const containsEscalationKeywords = (messageText) => {
    const escalationKeywords = [
        'supervisor', 'manager', 'frustrated', 'angry', 'upset', 
        'terrible', 'horrible', 'worst', 'refund', 'compensation', 
        'complaint', 'disappointed', 'dissatisfied', 'unhappy'
    ];
    
    return escalationKeywords.some(keyword => messageText.includes(keyword));
};

// Function to generate response based on message content
const generateResponse = async (messageText) => {
    try {
        // Always reload templates from file to ensure we have the latest version
        loadTemplatesFromFile();
        
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
            return responseTemplates.returns;
        }

        // Default to general response if no specific keywords are found
        return responseTemplates.general;

    } catch (error) {
        logger.error('Error generating response', { error: error.message });
        return responseTemplates.general; // Fallback to general response
    }
};

// Function to update templates
const updateTemplates = async (newTemplates) => {
    try {
        // Update template values
        for (const key in newTemplates) {
            if (responseTemplates.hasOwnProperty(key)) {
                responseTemplates[key] = newTemplates[key];
            }
        }
        
        // Save to file
        const saved = saveTemplatesToFile(responseTemplates);
        
        if (saved) {
            logger.info('Updated response templates successfully');
            return true;
        } else {
            throw new Error('Failed to save templates to file');
        }
    } catch (error) {
        logger.error('Error updating templates', { error: error.message });
        return false;
    }
};

// Function to reload templates from file (for admin use)
const reloadTemplates = () => {
    return loadTemplatesFromFile();
};

module.exports = { 
    generateResponse, 
    responseTemplates,
    updateTemplates,
    reloadTemplates
};

// config/config.js - Application configuration
