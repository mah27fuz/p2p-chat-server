// Simplified WebSocket Server - No Call Features
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());

app.get('/', (req, res) => {
  res.status(200).send('✅ P2P Server Running - Fast File Sharing!');
});

app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ 
  server,
  maxPayload: 1024 * 1024 * 1024 // 1GB max message size
});

const rooms = new Map();
const clients = new Map();

wss.on('connection', (ws) => {
  const clientId = 'user_' + Math.random().toString(36).substring(2, 9);
  clients.set(ws, { clientId, username: '', roomCode: '' });
  
  console.log('✓ Client connected:', clientId);
  
  ws.send(JSON.stringify({
    type: 'welcome',
    clientId
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleMessage(ws, data);
    } catch (error) {
      console.error('Parse error:', error);
    }
  });

  ws.on('close', () => {
    const client = clients.get(ws);
    if (client && client.roomCode) {
      handleUserLeave(ws, client.roomCode);
    }
    clients.delete(ws);
    console.log('✗ Client disconnected:', client?.clientId);
  });
});

function handleMessage(ws, data) {
  const client = clients.get(ws);
  
  switch (data.type) {
    case 'join-room':
      handleJoinRoom(ws, data);
      break;
      
    case 'send-message':
      broadcastToRoom(data.roomCode, ws, {
        type: 'receive-message',
        message: data.message
      });
      break;
      
    case 'send-file-chunk':
      // Forward file chunk to all peers
      broadcastToRoom(data.roomCode, ws, {
        type: 'receive-file-chunk',
        fileId: data.fileId,
        chunk: data.chunk,
        chunkIndex: data.chunkIndex,
        totalChunks: data.totalChunks
      });
      break;

    case 'send-file-complete':
      // Notify all peers that file is complete
      broadcastToRoom(data.roomCode, ws, {
        type: 'receive-file-complete',
        fileId: data.fileId,
        fileName: data.fileName,
        fileSize: data.fileSize,
        fileType: data.fileType,
        sender: data.sender,
        senderId: data.senderId,
        timestamp: data.timestamp
      });
      console.log(`>> File shared: ${data.fileName} (${(data.fileSize / 1024 / 1024).toFixed(2)} MB)`);
      break;
      
    case 'leave-room':
      handleUserLeave(ws, data.roomCode);
      break;
  }
}

function handleJoinRoom(ws, data) {
  const { roomCode, username, clientId } = data;
  const client = clients.get(ws);
  
  if (!client) return;
  
  client.username = username;
  client.roomCode = roomCode;
  
  if (!rooms.has(roomCode)) {
    rooms.set(roomCode, new Set());
  }
  
  const room = rooms.get(roomCode);
  
  broadcastToRoom(roomCode, ws, {
    type: 'user-joined',
    user: {
      clientId: client.clientId,
      username,
      online: true
    }
  });
  
  room.add(ws);
  
  const users = Array.from(room).map(clientWs => {
    const c = clients.get(clientWs);
    return {
      clientId: c.clientId,
      username: c.username,
      online: true
    };
  });
  
  ws.send(JSON.stringify({
    type: 'room-users',
    users
  }));
  
  console.log(`>> ${username} joined ${roomCode} (${room.size} peers online)`);
}

function handleUserLeave(ws, roomCode) {
  const client = clients.get(ws);
  const room = rooms.get(roomCode);
  
  if (room && client) {
    room.delete(ws);
    
    broadcastToRoom(roomCode, ws, {
      type: 'user-left',
      clientId: client.clientId,
      username: client.username
    });
    
    if (room.size === 0) {
      rooms.delete(roomCode);
      console.log(`>> Room ${roomCode} closed (empty)`);
    }
  }
}

function broadcastToRoom(roomCode, senderWs, message) {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  room.forEach(clientWs => {
    if (clientWs !== senderWs && clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify(message));
    }
  });
}

const PORT = process.env.PORT || 10000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════╗
║   SECURE P2P SERVER ONLINE            ║
║   Port: ${PORT}                           ║
║   Max File Size: 1GB                  ║
║   Fast Chunked Transfer               ║
╚════════════════════════════════════════╝
  `);
});

server.on('error', (error) => {
  console.error('Server error:', error);
  process.exit(1);
});
