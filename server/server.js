// server.js - Main server file for Socket.io chat application

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');
const multer = require('multer');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

// Multer setup for file uploads
const upload = multer({
  dest: path.join(__dirname, 'public', 'uploads'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// JWT authentication middleware for Socket.io
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('Authentication error: No token provided'));
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    socket.username = payload.username;
    return next();
  } catch (err) {
    return next(new Error('Authentication error: Invalid token'));
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store connected users and messages
const users = {};
const messages = [];
const typingUsers = {};

// Static list of rooms (channels)
const rooms = ['general', 'random', 'tech'];
// Track users in rooms: { roomName: Set(socket.id) }
const roomUsers = {};
rooms.forEach(room => { roomUsers[room] = new Set(); });

// Socket.io connection handler
io.on('connection', (socket) => {
  // Use username from JWT
  const username = socket.username || 'Anonymous';
  users[socket.id] = { username, id: socket.id };
  console.log(`User connected: ${socket.id} (${username})`);

  // Handle user joining (no longer needed to set username here)
  // socket.on('user_join', (username) => { ... });
  io.emit('user_list', Object.values(users));
  io.emit('user_joined', { username, id: socket.id });
  console.log(`${username} joined the chat`);

  // Join default room on connect
  const defaultRoom = 'general';
  socket.join(defaultRoom);
  roomUsers[defaultRoom].add(socket.id);
  socket.currentRoom = defaultRoom;
  // Notify user of current room
  socket.emit('joined_room', { room: defaultRoom, users: Array.from(roomUsers[defaultRoom]).map(id => users[id]).filter(Boolean) });
  // Handle join_room event
  socket.on('join_room', (room) => {
    if (!rooms.includes(room)) return;
    // Leave current room
    if (socket.currentRoom && roomUsers[socket.currentRoom]) {
      socket.leave(socket.currentRoom);
      roomUsers[socket.currentRoom].delete(socket.id);
      io.to(socket.currentRoom).emit('user_left_room', { username, id: socket.id, room: socket.currentRoom });
    }
    // Join new room
    socket.join(room);
    roomUsers[room].add(socket.id);
    socket.currentRoom = room;
    socket.emit('joined_room', { room, users: Array.from(roomUsers[room]).map(id => users[id]).filter(Boolean) });
    io.to(room).emit('user_joined_room', { username, id: socket.id, room });
  });
  // Handle leave_room event
  socket.on('leave_room', (room) => {
    if (!rooms.includes(room)) return;
    socket.leave(room);
    roomUsers[room].delete(socket.id);
    io.to(room).emit('user_left_room', { username, id: socket.id, room });
    // Optionally, join default room if user leaves all rooms
    if (socket.currentRoom === room) {
      socket.currentRoom = null;
    }
  });
  // Handle chat messages
  socket.on('send_message', (messageData) => {
    const room = messageData.room || socket.currentRoom || defaultRoom;
    if (!rooms.includes(room)) return;
    const message = {
      ...messageData,
      id: Date.now(),
      sender: users[socket.id]?.username || 'Anonymous',
      senderId: socket.id,
      timestamp: new Date().toISOString(),
      room,
      readBy: [socket.id], // Sender has read their own message
      reactions: {}, // { emoji: [userId, ...] }
    };
    
    messages.push(message);
    
    // Limit stored messages to prevent memory issues
    if (messages.length > 100) {
      messages.shift();
    }
    
    io.to(room).emit('receive_message', message);
  });

  // Handle message_read event
  socket.on('message_read', ({ messageId, room }) => {
    // Find the message
    const msg = messages.find(m => m.id === messageId && m.room === room);
    if (msg && !msg.readBy.includes(socket.id)) {
      msg.readBy.push(socket.id);
      // Notify room of updated readBy
      io.to(room).emit('message_read', { messageId, readBy: msg.readBy });
    }
  });

  // Handle message_reaction event
  socket.on('message_reaction', ({ messageId, room, emoji }) => {
    // Find the message
    const msg = messages.find(m => m.id === messageId && m.room === room);
    if (msg) {
      if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
      // Toggle reaction: add if not present, remove if present
      const idx = msg.reactions[emoji].indexOf(socket.id);
      if (idx === -1) {
        msg.reactions[emoji].push(socket.id);
      } else {
        msg.reactions[emoji].splice(idx, 1);
        if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
      }
      // Notify room of updated reactions
      io.to(room).emit('message_reaction', { messageId, reactions: msg.reactions });
    }
  });

  // Room-specific typing indicator
  socket.on('typing', (isTyping) => {
    const room = socket.currentRoom || defaultRoom;
    if (users[socket.id] && rooms.includes(room)) {
      const username = users[socket.id].username;
      
      if (!typingUsers[room]) typingUsers[room] = {};
      if (isTyping) {
        typingUsers[room][socket.id] = username;
      } else {
        delete typingUsers[room][socket.id];
      }
      
      io.to(room).emit('typing_users', Object.values(typingUsers[room]));
    }
  });

  // Handle private messages
  socket.on('private_message', ({ to, message }) => {
    const messageData = {
      id: Date.now(),
      sender: users[socket.id]?.username || 'Anonymous',
      senderId: socket.id,
      message,
      timestamp: new Date().toISOString(),
      isPrivate: true,
    };
    
    socket.to(to).emit('private_message', messageData);
    socket.emit('private_message', messageData);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    if (users[socket.id]) {
      const { username } = users[socket.id];
      io.emit('user_left', { username, id: socket.id });
      console.log(`${username} left the chat`);
    }
    
    delete users[socket.id];
    delete typingUsers[socket.id];
    
    io.emit('user_list', Object.values(users));
    io.emit('typing_users', Object.values(typingUsers));

    // On disconnect, remove user from all rooms
    rooms.forEach(room => {
      roomUsers[room].delete(socket.id);
      if (typingUsers[room]) delete typingUsers[room][socket.id];
      io.to(room).emit('user_left_room', { username, id: socket.id, room });
    });
  });
});

// API routes
app.get('/api/messages', (req, res) => {
  res.json(messages);
});

app.get('/api/users', (req, res) => {
  res.json(Object.values(users));
});

app.get('/api/rooms', (req, res) => {
  res.json(rooms);
});

// API route for login (issues JWT)
app.post('/api/login', (req, res) => {
  const { username } = req.body;
  if (!username || typeof username !== 'string' || username.trim() === '') {
    return res.status(400).json({ error: 'Username is required' });
  }
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, username });
});

// File upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  // Build file URL
  const fileUrl = `/uploads/${req.file.filename}`;
  const fileType = req.file.mimetype;
  res.json({ url: fileUrl, type: fileType, originalName: req.file.originalname });
});

// Root route
app.get('/', (req, res) => {
  res.send('Socket.io Chat Server is running');
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server, io }; 