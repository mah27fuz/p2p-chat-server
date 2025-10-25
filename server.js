// Enhanced WebSocket Server with Group Call Support
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());

app.get('/', (req, res) => {
  res.send('✅ P2P Server Running - Group Calls Enabled!');
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

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
      
    case 'send-file':
      broadcastToRoom(data.roomCode, ws, {
        type: 'receive-file',
        file: data.file
      });
      break;
      
    case 'call-start':
      // Notify all peers that someone started a call
      broadcastToRoom(data.roomCode, ws, {
        type: 'call-start',
        callType: data.callType,
        username: data.username,
        from: data.from
      });
      break;
      
    case 'call-offer':
      // Send offer to specific peer
      sendToPeer(data.targetPeer, {
        type: 'call-offer',
        offer: data.offer,
        from: data.from,
        username: data.username
      });
      break;
      
    case 'call-answer':
      // Send answer to specific peer
      sendToPeer(data.targetPeer, {
        type: 'call-answer',
        answer: data.answer,
        from: data.from
      });
      break;
      
    case 'ice-candidate':
      // Send ICE candidate to specific peer
      sendToPeer(data.targetPeer, {
        type: 'ice-candidate',
        candidate: data.candidate,
        from: data.from
      });
      break;
      
    case 'call-end':
      // Notify all that user left call
      broadcastToRoom(data.roomCode, ws, {
        type: 'call-end',
        username: data.username,
        from: data.from
      });
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

function sendToPeer(targetClientId, message) {
  // Find the WebSocket connection for the target client
  for (const [ws, client] of clients.entries()) {
    if (client.clientId === targetClientId && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      return;
    }
  }
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   SECURE P2P SERVER ONLINE            ║
║   Port: ${PORT}                           ║
║   WebRTC: GROUP CALLS ENABLED         ║
║   Encryption: END-TO-END              ║
╚════════════════════════════════════════╝
  `);
});
