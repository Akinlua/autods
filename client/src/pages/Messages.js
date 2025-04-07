import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemAvatar,
  Avatar,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  IconButton,
  Badge,
  Chip,
} from '@mui/material';
import {
  Email as EmailIcon,
  Reply as ReplyIcon,
  MarkunreadMailbox as UnreadIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  Send as SendIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';

// Mock messages for demonstration
const mockMessages = [
  {
    id: 1,
    sender: 'customer123',
    subject: 'Question about item #123456789',
    text: 'Hello, I have a question about the product. Does it come with a warranty?',
    recipientID: 'myseller',
    creationDate: new Date('2023-05-10T14:30:00'),
    read: true,
    itemId: '123456789',
  },
  {
    id: 2,
    sender: 'buyer456',
    subject: 'Shipping inquiry for order #987654321',
    text: 'Hi there, I just ordered your product and was wondering when it will be shipped? Thanks!',
    recipientID: 'myseller',
    creationDate: new Date('2023-05-11T09:15:00'),
    read: false,
    itemId: '987654321',
  },
  {
    id: 3,
    sender: 'shopaholic789',
    subject: 'Return request for item #AB123456',
    text: 'I received the wrong item and would like to return it. How do I proceed with the return?',
    recipientID: 'myseller',
    creationDate: new Date('2023-05-12T11:45:00'),
    read: false,
    itemId: 'AB123456',
  },
];

const Messages = () => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [replyText, setReplyText] = useState('');

  // Fetch messages
  useEffect(() => {
    const fetchMessages = async () => {
      try {
        // In a real app, you would fetch data from your API
        // const response = await fetch('/api/messages');
        // const data = await response.json();
        
        // For now, we'll use mock data
        setTimeout(() => {
          setMessages(mockMessages);
          setLoading(false);
        }, 1000);
      } catch (err) {
        setError('Failed to load messages');
        setLoading(false);
      }
    };

    fetchMessages();
  }, []);

  // Mark message as read
  const handleMessageClick = (message) => {
    setSelectedMessage(message);
    setOpenDialog(true);

    // Mark as read if unread
    if (!message.read) {
      const updatedMessages = messages.map((msg) => {
        if (msg.id === message.id) {
          return { ...msg, read: true };
        }
        return msg;
      });
      setMessages(updatedMessages);
    }
  };

  // Close dialog
  const handleCloseDialog = () => {
    setOpenDialog(false);
    setReplyText('');
  };

  // Handle reply submission
  const handleReply = async () => {
    // In a real app, you would send the reply to your API
    // await fetch('/api/messages/reply', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     messageId: selectedMessage.id,
    //     content: replyText,
    //     recipientId: selectedMessage.sender
    //   })
    // });

    // For demonstration, we'll just update the UI
    console.log(`Reply to ${selectedMessage.sender}: ${replyText}`);
    setReplyText('');
    handleCloseDialog();
  };

  // Handle refresh
  const handleRefresh = () => {
    setLoading(true);
    
    // In a real app, you would fetch fresh data from your API
    setTimeout(() => {
      setMessages(mockMessages);
      setLoading(false);
    }, 1000);
  };

  // Handle delete
  const handleDelete = (messageId) => {
    if (window.confirm('Are you sure you want to delete this message?')) {
      // In a real app, you would send a delete request to your API
      const updatedMessages = messages.filter((message) => message.id !== messageId);
      setMessages(updatedMessages);
      
      if (selectedMessage && selectedMessage.id === messageId) {
        setSelectedMessage(null);
        setOpenDialog(false);
      }
    }
  };

  const unreadCount = messages.filter((message) => !message.read).length;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">
          eBay Messages
          {unreadCount > 0 && (
            <Badge color="error" badgeContent={unreadCount} sx={{ ml: 2 }} />
          )}
        </Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={handleRefresh}
        >
          Refresh
        </Button>
      </Box>

      {messages.length === 0 ? (
        <Alert severity="info">No messages to display</Alert>
      ) : (
        <Paper sx={{ width: '100%' }}>
          <List sx={{ width: '100%' }}>
            {messages.map((message) => (
              <React.Fragment key={message.id}>
                <ListItem
                  alignItems="flex-start"
                  button
                  onClick={() => handleMessageClick(message)}
                  sx={{
                    backgroundColor: message.read ? 'inherit' : 'rgba(25, 118, 210, 0.08)',
                  }}
                >
                  <ListItemAvatar>
                    <Avatar>
                      {message.read ? <EmailIcon /> : <UnreadIcon color="primary" />}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography component="span" variant="subtitle1" fontWeight={message.read ? 'normal' : 'bold'}>
                          {message.subject}
                        </Typography>
                        <Typography component="span" variant="body2" color="text.secondary">
                          {format(new Date(message.creationDate), 'MMM d, yyyy h:mm a')}
                        </Typography>
                      </Box>
                    }
                    secondary={
                      <React.Fragment>
                        <Typography
                          component="span"
                          variant="body2"
                          color="text.primary"
                          fontWeight={message.read ? 'normal' : 'bold'}
                        >
                          From: {message.sender}
                        </Typography>
                        <Typography
                          component="p"
                          variant="body2"
                          color="text.secondary"
                          sx={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                          }}
                        >
                          {message.text}
                        </Typography>
                      </React.Fragment>
                    }
                  />
                  <IconButton
                    edge="end"
                    aria-label="delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(message.id);
                    }}
                  >
                    <DeleteIcon />
                  </IconButton>
                </ListItem>
                <Divider variant="inset" component="li" />
              </React.Fragment>
            ))}
          </List>
        </Paper>
      )}

      {/* Message Dialog */}
      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
      >
        {selectedMessage && (
          <>
            <DialogTitle>
              {selectedMessage.subject}
            </DialogTitle>
            <DialogContent dividers>
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  From: {selectedMessage.sender}
                </Typography>
                <Typography variant="subtitle2" color="text.secondary">
                  Date: {format(new Date(selectedMessage.creationDate), 'MMM d, yyyy h:mm a')}
                </Typography>
                {selectedMessage.itemId && (
                  <Typography variant="subtitle2" color="text.secondary">
                    Related Item: <Chip size="small" label={`ID: ${selectedMessage.itemId}`} color="primary" />
                  </Typography>
                )}
              </Box>
              <Typography paragraph>
                {selectedMessage.text}
              </Typography>
              <Divider sx={{ my: 3 }} />
              <Typography variant="h6" gutterBottom>
                Reply to this message
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={6}
                variant="outlined"
                placeholder="Type your reply here..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={handleCloseDialog}>
                Cancel
              </Button>
              <Button
                variant="contained"
                startIcon={<SendIcon />}
                onClick={handleReply}
                disabled={!replyText.trim()}
              >
                Send Reply
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default Messages; 