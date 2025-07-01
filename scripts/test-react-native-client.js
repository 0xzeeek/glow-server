#!/usr/bin/env node

/**
 * Test client for React Native developers
 * Run with: node test-react-native-client.js
 * 
 * This demonstrates the WebSocket connection flow without authentication
 * for quick testing. In production, you'll need wallet authentication.
 */

const WebSocket = require('ws');

// Configuration
const WS_URL = process.env.WS_URL || 'wss://your-api.execute-api.us-east-1.amazonaws.com/production';
const TEST_TOKEN = process.env.TEST_TOKEN || 'So11111111111111111111111111111111111111112'; // Wrapped SOL
const TEST_WALLET = process.env.TEST_WALLET || 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';

console.log('🚀 React Native WebSocket Test Client');
console.log('=====================================');
console.log(`URL: ${WS_URL}`);
console.log(`Test Token: ${TEST_TOKEN}`);
console.log(`Test Wallet: ${TEST_WALLET}`);
console.log('');

// Create WebSocket connection
const ws = new WebSocket(WS_URL);

// Connection opened
ws.on('open', () => {
  console.log('✅ Connected to WebSocket');
  console.log('');
  
  // Test 1: Subscribe to price updates
  console.log('📊 Subscribing to price updates...');
  ws.send(JSON.stringify({
    action: 'subscribePrice',
    token: TEST_TOKEN
  }));
  
  // Test 2: Subscribe to balance updates
  setTimeout(() => {
    console.log('💰 Subscribing to balance updates...');
    ws.send(JSON.stringify({
      action: 'subscribeBalance',
      wallet: TEST_WALLET
    }));
  }, 1000);
  
  // Test 3: Send ping
  setInterval(() => {
    ws.send(JSON.stringify({ type: 'ping' }));
  }, 30000);
});

// Handle messages
ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    
    switch (message.type) {
      case 'connected':
        console.log(`🔗 Connection confirmed: ${message.connectionId}`);
        break;
        
      case 'PRICE_UPDATE':
        console.log(`📈 Price Update: ${message.token}`);
        console.log(`   Price: $${message.price}`);
        console.log(`   Time: ${new Date(message.timestamp).toISOString()}`);
        if (message.slot) console.log(`   Slot: ${message.slot}`);
        break;
        
      case 'BALANCE_UPDATE':
        console.log(`💸 Balance Update: ${message.wallet}`);
        console.log(`   Token: ${message.token}`);
        console.log(`   Balance: ${message.balance}`);
        break;
        
      case 'pong':
        // Heartbeat response
        break;
        
      default:
        console.log('📦 Unknown message:', message);
    }
    console.log('');
  } catch (error) {
    console.error('❌ Failed to parse message:', error);
  }
});

// Handle errors
ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
});

// Handle close
ws.on('close', (code, reason) => {
  console.log(`🔌 Disconnected: ${code} - ${reason}`);
  process.exit(0);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n👋 Closing connection...');
  ws.close();
  process.exit(0);
});

console.log('🔄 Waiting for updates... (Press Ctrl+C to exit)');
console.log(''); 