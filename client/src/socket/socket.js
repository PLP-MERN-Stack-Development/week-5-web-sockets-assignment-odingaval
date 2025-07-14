// socket.js - Socket.io client setup

import { io } from 'socket.io-client';
import { useEffect, useState } from 'react';

// Socket.io connection URL
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

// Create socket instance
export const socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

// Helper: login and store JWT token
export const login = async (username) => {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  if (!res.ok) throw new Error('Login failed');
  const data = await res.json();
  localStorage.setItem('token', data.token);
  localStorage.setItem('username', data.username);
  return data;
};

export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  socket.disconnect();
};

// Fetch available rooms from the server
export const fetchRooms = async () => {
  const res = await fetch('/api/rooms');
  if (!res.ok) throw new Error('Failed to fetch rooms');
  return await res.json();
};

// Upload a file to the server
export const uploadFile = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error('File upload failed');
  return await res.json();
};

// Send a file message (upload then emit)
const sendFileMessage = async (file, room) => {
  const fileInfo = await uploadFile(file);
  socket.emit('send_message', {
    type: 'file',
    url: fileInfo.url,
    fileType: fileInfo.type,
    originalName: fileInfo.originalName,
    room: room || 'general',
  });
};

// Custom hook for using socket.io
export const useSocket = () => {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [lastMessage, setLastMessage] = useState(null);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [currentRoom, setCurrentRoom] = useState('general');
  const [roomUsers, setRoomUsers] = useState([]);

  // Modified connect to use JWT token
  const connect = () => {
    const token = localStorage.getItem('token');
    if (token) {
      socket.auth = { token };
      socket.connect();
    } else {
      throw new Error('No JWT token found. Please login first.');
    }
  };

  // Disconnect from socket server
  const disconnect = () => {
    socket.disconnect();
  };

  // Send a message
  const sendMessage = (message) => {
    socket.emit('send_message', { message });
  };

  // Send a private message
  const sendPrivateMessage = (to, message) => {
    socket.emit('private_message', { to, message });
  };

  // Set typing status
  const setTyping = (isTyping) => {
    socket.emit('typing', isTyping);
  };

  // Join a room
  const joinRoom = (room) => {
    socket.emit('join_room', room);
  };
  // Leave a room
  const leaveRoom = (room) => {
    socket.emit('leave_room', room);
  };

  // Socket event listeners
  useEffect(() => {
    // Connection events
    const onConnect = () => {
      setIsConnected(true);
    };

    const onDisconnect = () => {
      setIsConnected(false);
    };

    // Message events
    const onReceiveMessage = (message) => {
      setLastMessage(message);
      setMessages((prev) => [...prev, message]);
    };

    const onPrivateMessage = (message) => {
      setLastMessage(message);
      setMessages((prev) => [...prev, message]);
    };

    // User events
    const onUserList = (userList) => {
      setUsers(userList);
    };

    const onUserJoined = (user) => {
      // You could add a system message here
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          system: true,
          message: `${user.username} joined the chat`,
          timestamp: new Date().toISOString(),
        },
      ]);
    };

    const onUserLeft = (user) => {
      // You could add a system message here
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          system: true,
          message: `${user.username} left the chat`,
          timestamp: new Date().toISOString(),
        },
      ]);
    };

    // Typing events
    const onTypingUsers = (users) => {
      setTypingUsers(users);
    };

    // Room events
    const onJoinedRoom = ({ room, users }) => {
      setCurrentRoom(room);
      setRoomUsers(users);
      setMessages([]); // Optionally clear messages when switching rooms
    };
    const onUserJoinedRoom = ({ username }) => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          system: true,
          message: `${username} joined the room`,
          timestamp: new Date().toISOString(),
        },
      ]);
    };
    const onUserLeftRoom = ({ username }) => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          system: true,
          message: `${username} left the room`,
          timestamp: new Date().toISOString(),
        },
      ]);
    };

    // Register event listeners
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('receive_message', onReceiveMessage);
    socket.on('private_message', onPrivateMessage);
    socket.on('user_list', onUserList);
    socket.on('user_joined', onUserJoined);
    socket.on('user_left', onUserLeft);
    socket.on('typing_users', onTypingUsers);
    socket.on('joined_room', onJoinedRoom);
    socket.on('user_joined_room', onUserJoinedRoom);
    socket.on('user_left_room', onUserLeftRoom);

    // Clean up event listeners
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('receive_message', onReceiveMessage);
      socket.off('private_message', onPrivateMessage);
      socket.off('user_list', onUserList);
      socket.off('user_joined', onUserJoined);
      socket.off('user_left', onUserLeft);
      socket.off('typing_users', onTypingUsers);
      socket.off('joined_room', onJoinedRoom);
      socket.off('user_joined_room', onUserJoinedRoom);
      socket.off('user_left_room', onUserLeftRoom);
    };
  }, []);

  return {
    socket,
    isConnected,
    lastMessage,
    messages,
    users,
    typingUsers,
    currentRoom,
    roomUsers,
    connect,
    disconnect,
    sendMessage,
    sendPrivateMessage,
    setTyping,
    login,
    logout,
    joinRoom,
    leaveRoom,
    fetchRooms,
    uploadFile,
    sendFileMessage,
  };
};

export default socket; 