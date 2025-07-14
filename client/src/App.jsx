import { useEffect, useRef, useState } from 'react';
import { useSocket, login as socketLogin, logout as socketLogout, fetchRooms } from './socket/socket';
import './App.css';

function App() {
  // Auth state
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [inputUsername, setInputUsername] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('token'));
  // Room state
  const [rooms, setRooms] = useState([]);
  const [roomLoading, setRoomLoading] = useState(false);
  // Message/file input
  const [message, setMessage] = useState('');
  const [file, setFile] = useState(null);
  // Typing
  const typingTimeout = useRef(null);

  // Socket hook
  const {
    isConnected,
    messages,
    users,
    typingUsers,
    currentRoom,
    roomUsers,
    connect,
    disconnect,
    sendMessage,
    sendFileMessage,
    setTyping,
    joinRoom,
    fetchRooms: fetchRoomsFn,
    logout: socketLogoutFn,
  } = useSocket();

  // Fetch rooms on mount
  useEffect(() => {
    setRoomLoading(true);
    fetchRoomsFn().then(setRooms).finally(() => setRoomLoading(false));
  }, [fetchRoomsFn]);

  // Connect socket on login
  useEffect(() => {
    if (isLoggedIn) {
      connect();
    } else {
      disconnect();
    }
    // eslint-disable-next-line
  }, [isLoggedIn]);

  // Typing indicator logic
  const handleTyping = (e) => {
    setMessage(e.target.value);
    setTyping(true);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => setTyping(false), 1000);
  };

  // Login handler
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await socketLogin(inputUsername);
      setUsername(inputUsername);
      setIsLoggedIn(true);
    } catch (err) {
      alert('Login failed');
    }
  };

  // Logout handler
  const handleLogout = () => {
    socketLogout();
    setIsLoggedIn(false);
    setUsername('');
  };

  // Room change handler
  const handleRoomChange = (e) => {
    joinRoom(e.target.value);
  };

  // Send message handler
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (file) {
      await sendFileMessage(file, currentRoom);
      setFile(null);
    } else if (message.trim()) {
      sendMessage({ text: message, room: currentRoom });
    }
    setMessage('');
    setTyping(false);
  };

  // File input handler
  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  // Message read and reaction handlers (minimal UI)
  const handleRead = (msg) => {
    if (msg && msg.id && msg.room) {
      // Emit read receipt
      if (window.socket) window.socket.emit('message_read', { messageId: msg.id, room: msg.room });
    }
  };
  const handleReaction = (msg, emoji) => {
    if (msg && msg.id && msg.room) {
      if (window.socket) window.socket.emit('message_reaction', { messageId: msg.id, room: msg.room, emoji });
    }
  };

  // Render
  if (!isLoggedIn) {
    return (
      <div className="login-container">
        <h2>Login to Chat</h2>
        <form onSubmit={handleLogin}>
          <input
            type="text"
            placeholder="Enter username"
            value={inputUsername}
            onChange={e => setInputUsername(e.target.value)}
            required
          />
          <button type="submit">Login</button>
        </form>
      </div>
    );
  }

  return (
    <div className="chat-app">
      <header>
        <h2>Socket.io Chat</h2>
        <div>
          <span>Logged in as <b>{username}</b></span>
          <button onClick={handleLogout}>Logout</button>
        </div>
      </header>
      <section className="room-select">
        <label>Room: </label>
        {roomLoading ? (
          <span>Loading rooms...</span>
        ) : (
          <select value={currentRoom} onChange={handleRoomChange}>
            {rooms.map(room => (
              <option key={room} value={room}>{room}</option>
            ))}
          </select>
        )}
        <span>Users in room: {roomUsers.map(u => u?.username).join(', ')}</span>
      </section>
      <section className="messages" style={{ height: 400, overflowY: 'auto', border: '1px solid #ccc', margin: '1em 0', padding: 8 }}>
        {messages.map((msg, idx) => (
          <div key={msg.id || idx} className={msg.system ? 'system-message' : 'chat-message'} onMouseEnter={() => handleRead(msg)}>
            <div>
              {msg.system ? (
                <i>{msg.message}</i>
              ) : msg.type === 'file' ? (
                <span>
                  <b>{msg.sender}:</b> <a href={msg.url} target="_blank" rel="noopener noreferrer">{msg.originalName}</a>
                  {msg.fileType && msg.fileType.startsWith('image') && (
                    <div><img src={msg.url} alt={msg.originalName} style={{ maxWidth: 200, maxHeight: 200 }} /></div>
                  )}
                </span>
              ) : (
                <span><b>{msg.sender}:</b> {msg.text || msg.message}</span>
              )}
            </div>
            {!msg.system && (
              <div className="meta">
                <span style={{ fontSize: 10 }}>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                {/* Read receipts */}
                {msg.readBy && (
                  <span style={{ fontSize: 10, marginLeft: 8 }}>
                    Read by: {msg.readBy.length}
                  </span>
                )}
                {/* Reactions */}
                {msg.reactions && (
                  <span style={{ marginLeft: 8 }}>
                    {Object.entries(msg.reactions).map(([emoji, users]) => (
                      <button key={emoji} onClick={() => handleReaction(msg, emoji)} style={{ marginRight: 4 }}>
                        {emoji} {users.length}
                      </button>
                    ))}
                    {/* Add new reaction */}
                    <button onClick={() => handleReaction(msg, '👍')}>👍</button>
                    <button onClick={() => handleReaction(msg, '😂')}>😂</button>
                    <button onClick={() => handleReaction(msg, '❤️')}>❤️</button>
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </section>
      <section className="typing-indicator">
        {typingUsers.length > 0 && (
          <span>{typingUsers.join(', ')} typing...</span>
        )}
      </section>
      <form className="message-input" onSubmit={handleSendMessage} style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          placeholder="Type a message..."
          value={message}
          onChange={handleTyping}
          onBlur={() => setTyping(false)}
          disabled={!isConnected}
          style={{ flex: 1 }}
        />
        <input type="file" onChange={handleFileChange} />
        <button type="submit" disabled={!isConnected || (!message.trim() && !file)}>Send</button>
      </form>
    </div>
  );
}

export default App;
