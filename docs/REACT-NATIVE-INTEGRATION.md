# React Native Integration Guide

This guide covers everything you need to integrate your React Native app with the Solana Trading Backend.

## Table of Contents
- [Overview](#overview)
- [Installation](#installation)
- [WebSocket Connection](#websocket-connection)
- [Authentication](#authentication)
- [Subscribing to Updates](#subscribing-to-updates)
- [REST API Integration](#rest-api-integration)
- [Type Definitions](#type-definitions)
- [State Management](#state-management)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)

## Overview

The backend provides two main ways to interact:
1. **WebSocket API** - Real-time price and balance updates
2. **REST API** - Historical data, user profiles, metadata

## Installation

```bash
npm install @solana/web3.js tweetnacl react-native-url-polyfill
# For React Native 0.60+ auto-linking will handle native dependencies
```

### Polyfills

Add to your app's entry point (e.g., `index.js`):

```javascript
import 'react-native-url-polyfill/auto';
```

## WebSocket Connection

### Basic Connection Manager

```typescript
// src/services/WebSocketManager.ts
import { EventEmitter } from 'events';

export interface PriceUpdate {
  type: 'PRICE_UPDATE';
  token: string;
  price: number;
  timestamp: number;
  slot?: number;
  txSignature?: string;
}

export interface BalanceUpdate {
  type: 'BALANCE_UPDATE';
  wallet: string;
  token: string;
  balance: number;
  timestamp: number;
}

class WebSocketManager extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  
  constructor(
    private wsUrl: string,
    private useCloudflare: boolean = false
  ) {
    super();
  }

  connect(token?: string): void {
    try {
      // Choose endpoint based on configuration
      const url = this.useCloudflare && token
        ? `${this.wsUrl}/ws/${token}`  // Cloudflare: wss://broadcast.domain.com/ws/TOKEN
        : this.wsUrl;                   // AWS: wss://xxx.execute-api.region.amazonaws.com/production

      this.ws = new WebSocket(url);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.emit('connected');
        this.startPing();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error('Failed to parse message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.emit('error', error);
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        this.stopPing();
        this.emit('disconnected');
        this.attemptReconnect();
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.attemptReconnect();
    }
  }

  private handleMessage(data: any): void {
    switch (data.type) {
      case 'PRICE_UPDATE':
        this.emit('priceUpdate', data as PriceUpdate);
        break;
      case 'BALANCE_UPDATE':
        this.emit('balanceUpdate', data as BalanceUpdate);
        break;
      case 'connected':
        console.log('Connection confirmed:', data.connectionId);
        break;
      case 'pong':
        // Heartbeat response
        break;
      default:
        console.log('Unknown message type:', data.type);
    }
  }

  send(message: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected');
    }
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping' });
    }, 30000); // Every 30 seconds
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.emit('maxReconnectAttemptsReached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
    
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.stopPing();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export default WebSocketManager;
```

### Using the WebSocket Manager

```typescript
// src/hooks/useWebSocket.ts
import { useEffect, useRef, useCallback } from 'react';
import WebSocketManager, { PriceUpdate, BalanceUpdate } from '../services/WebSocketManager';

const WS_URL = __DEV__ 
  ? 'ws://localhost:3000' // Local development
  : 'wss://your-api.execute-api.us-east-1.amazonaws.com/production'; // Production AWS

// Or for Cloudflare:
// const WS_URL = 'wss://broadcast.yourdomain.com';

export const useWebSocket = () => {
  const wsManager = useRef<WebSocketManager | null>(null);

  useEffect(() => {
    wsManager.current = new WebSocketManager(WS_URL, false);
    wsManager.current.connect();

    return () => {
      wsManager.current?.disconnect();
    };
  }, []);

  const subscribeToPrice = useCallback((token: string, callback: (update: PriceUpdate) => void) => {
    if (!wsManager.current) return;

    // Subscribe to updates
    wsManager.current.send({
      action: 'subscribePrice',
      token,
    });

    // Listen for updates
    const handler = (update: PriceUpdate) => {
      if (update.token === token) {
        callback(update);
      }
    };

    wsManager.current.on('priceUpdate', handler);

    // Return unsubscribe function
    return () => {
      wsManager.current?.off('priceUpdate', handler);
      // Optionally unsubscribe from server
      // wsManager.current?.send({ action: 'unsubscribePrice', token });
    };
  }, []);

  const subscribeToBalance = useCallback((wallet: string, callback: (update: BalanceUpdate) => void) => {
    if (!wsManager.current) return;

    wsManager.current.send({
      action: 'subscribeBalance',
      wallet,
    });

    const handler = (update: BalanceUpdate) => {
      if (update.wallet === wallet) {
        callback(update);
      }
    };

    wsManager.current.on('balanceUpdate', handler);

    return () => {
      wsManager.current?.off('balanceUpdate', handler);
    };
  }, []);

  return {
    subscribeToPrice,
    subscribeToBalance,
    isConnected: wsManager.current !== null,
  };
};
```

## Authentication

The WebSocket requires Solana wallet signature authentication on connect.

### Wallet Authentication Flow

```typescript
// src/services/AuthService.ts
import { Connection, PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const API_URL = 'https://your-api.execute-api.us-east-1.amazonaws.com';

export class AuthService {
  static async getNonce(walletAddress: string): Promise<string> {
    const response = await fetch(`${API_URL}/login/nonce?wallet=${walletAddress}`);
    const data = await response.json();
    return data.nonce;
  }

  static async authenticateWebSocket(
    wallet: any, // Your wallet adapter (Phantom, Solflare, etc.)
    wsUrl: string
  ): Promise<WebSocket> {
    // 1. Get nonce from backend
    const nonce = await this.getNonce(wallet.publicKey.toString());
    
    // 2. Sign the nonce
    const message = new TextEncoder().encode(nonce);
    const signature = await wallet.signMessage(message);
    
    // 3. Connect with auth params
    const authParams = new URLSearchParams({
      wallet: wallet.publicKey.toString(),
      signature: bs58.encode(signature),
      nonce: nonce,
    });
    
    const ws = new WebSocket(`${wsUrl}?${authParams}`);
    
    return new Promise((resolve, reject) => {
      ws.onopen = () => resolve(ws);
      ws.onerror = (error) => reject(error);
    });
  }
}
```

### Using Authentication in Components

```typescript
// src/components/TradingView.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useWallet } from '../hooks/useWallet'; // Your wallet hook

export const TradingView: React.FC = () => {
  const { wallet, connected } = useWallet();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  
  useEffect(() => {
    if (connected && wallet) {
      authenticateAndConnect();
    }
  }, [connected, wallet]);
  
  const authenticateAndConnect = async () => {
    setIsAuthenticating(true);
    try {
      const ws = await AuthService.authenticateWebSocket(
        wallet,
        'wss://your-api.execute-api.us-east-1.amazonaws.com/production'
      );
      
      // Use authenticated WebSocket
      console.log('Authenticated and connected!');
    } catch (error) {
      console.error('Authentication failed:', error);
    } finally {
      setIsAuthenticating(false);
    }
  };
  
  if (isAuthenticating) {
    return <ActivityIndicator size="large" />;
  }
  
  // ... rest of component
};
```

## Subscribing to Updates

### Price Updates Component

```typescript
// src/components/PriceDisplay.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useWebSocket } from '../hooks/useWebSocket';

interface Props {
  tokenMint: string;
  tokenSymbol: string;
}

export const PriceDisplay: React.FC<Props> = ({ tokenMint, tokenSymbol }) => {
  const [price, setPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<'up' | 'down' | null>(null);
  const { subscribeToPrice } = useWebSocket();
  
  useEffect(() => {
    const unsubscribe = subscribeToPrice(tokenMint, (update) => {
      setPriceChange(update.price > (price || 0) ? 'up' : 'down');
      setPrice(update.price);
      
      // Reset color after animation
      setTimeout(() => setPriceChange(null), 500);
    });
    
    return () => {
      unsubscribe?.();
    };
  }, [tokenMint, subscribeToPrice]);
  
  return (
    <View style={styles.container}>
      <Text style={styles.symbol}>{tokenSymbol}</Text>
      <Text style={[
        styles.price,
        priceChange === 'up' && styles.priceUp,
        priceChange === 'down' && styles.priceDown,
      ]}>
        ${price?.toFixed(6) || '---'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
  },
  symbol: {
    fontSize: 14,
    color: '#888',
    marginBottom: 4,
  },
  price: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    transition: 'color 0.3s',
  },
  priceUp: {
    color: '#00ff88',
  },
  priceDown: {
    color: '#ff3366',
  },
});
```

### Balance Updates Component

```typescript
// src/components/BalanceDisplay.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useWebSocket } from '../hooks/useWebSocket';
import { useWallet } from '../hooks/useWallet';

interface TokenBalance {
  token: string;
  balance: number;
  value?: number;
}

export const BalanceDisplay: React.FC = () => {
  const [balances, setBalances] = useState<Map<string, TokenBalance>>(new Map());
  const { subscribeToBalance } = useWebSocket();
  const { publicKey } = useWallet();
  
  useEffect(() => {
    if (!publicKey) return;
    
    const unsubscribe = subscribeToBalance(publicKey.toString(), (update) => {
      setBalances(prev => {
        const newBalances = new Map(prev);
        newBalances.set(update.token, {
          token: update.token,
          balance: update.balance,
        });
        return newBalances;
      });
    });
    
    return () => {
      unsubscribe?.();
    };
  }, [publicKey, subscribeToBalance]);
  
  const balanceArray = Array.from(balances.values());
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Balances</Text>
      <FlatList
        data={balanceArray}
        keyExtractor={item => item.token}
        renderItem={({ item }) => (
          <View style={styles.balanceItem}>
            <Text style={styles.token}>{item.token}</Text>
            <Text style={styles.balance}>{item.balance.toFixed(4)}</Text>
          </View>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#fff',
  },
  balanceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  token: {
    fontSize: 16,
    color: '#fff',
  },
  balance: {
    fontSize: 16,
    color: '#00ff88',
    fontWeight: '600',
  },
});
```

## REST API Integration

### API Client

```typescript
// src/services/ApiClient.ts
const API_BASE_URL = 'https://your-api.execute-api.us-east-1.amazonaws.com';

export interface TokenMetadata {
  token: string;
  symbol: string;
  name: string;
  decimals: number;
  imageUrl?: string;
  phase: 'bonding' | 'amm';
  ammPool?: string;
  description?: string;
}

export interface PricePoint {
  timestamp: number;
  price: number;
}

export interface UserProfile {
  wallet: string;
  createdAt: number;
  referredBy?: string;
  profileUrl?: string;
  lastLogin: number;
}

export interface PnLData {
  token: string;
  invested: number;
  current: number;
  profit: number;
  profitPercent: number;
}

class ApiClient {
  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  }
  
  // Token endpoints
  async getLatestPrice(mint: string): Promise<{ price: number; timestamp: number }> {
    return this.request(`/tokens/${mint}/price`);
  }
  
  async getHistoricalPrices(mint: string, range: '1h' | '24h' | '7d' | '30d' = '24h'): Promise<PricePoint[]> {
    return this.request(`/tokens/${mint}/prices?range=${range}`);
  }
  
  async getTokenMetadata(mint: string): Promise<TokenMetadata> {
    return this.request(`/tokens/${mint}`);
  }
  
  async updateTokenMetadata(mint: string, metadata: Partial<TokenMetadata>): Promise<TokenMetadata> {
    return this.request(`/tokens/${mint}`, {
      method: 'PUT',
      body: JSON.stringify(metadata),
    });
  }
  
  // User endpoints
  async getUser(wallet: string): Promise<UserProfile> {
    return this.request(`/users/${wallet}`);
  }
  
  async updateUser(wallet: string, profile: Partial<UserProfile>): Promise<UserProfile> {
    return this.request(`/users/${wallet}`, {
      method: 'PUT',
      body: JSON.stringify(profile),
    });
  }
  
  async getUserPnL(wallet: string, token?: string): Promise<PnLData[]> {
    const query = token ? `?token=${token}` : '';
    return this.request(`/users/${wallet}/pnl${query}`);
  }
  
  async getUserAggregatePnL(wallet: string): Promise<{
    totalInvested: number;
    totalCurrent: number;
    totalProfit: number;
    profitPercent: number;
  }> {
    return this.request(`/users/${wallet}/pnl/aggregate`);
  }
  
  // Health check
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return this.request('/health/live');
  }
  
  // Image upload endpoints
  async getTokenImageUploadUrl(mint: string): Promise<{
    uploadUrl: string;
    publicUrl: string;
    key: string;
    expiresIn: number;
  }> {
    return this.request(`/tokens/${mint}/image`, { method: 'POST' });
  }
  
  async getUserImageUploadUrl(wallet: string): Promise<{
    uploadUrl: string;
    publicUrl: string;
    key: string;
    expiresIn: number;
  }> {
    return this.request(`/users/${wallet}/image`, { method: 'POST' });
  }
}

export default new ApiClient();
```

### Using the API Client

```typescript
// src/hooks/useTokenData.ts
import { useEffect, useState } from 'react';
import ApiClient, { TokenMetadata, PricePoint } from '../services/ApiClient';

export const useTokenData = (mint: string) => {
  const [metadata, setMetadata] = useState<TokenMetadata | null>(null);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [meta, prices] = await Promise.all([
          ApiClient.getTokenMetadata(mint),
          ApiClient.getHistoricalPrices(mint, '24h'),
        ]);
        
        setMetadata(meta);
        setPriceHistory(prices);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [mint]);
  
  return { metadata, priceHistory, loading, error };
};
```

## Type Definitions

We provide a complete TypeScript definitions file that you can copy to your project:

```bash
# Copy the types file from the backend repo
cp backend/types/backend.d.ts src/types/
```

Or create your own central types file:

```typescript
// src/types/trading.ts

// WebSocket message types
export interface WSMessage {
  action: 'subscribePrice' | 'subscribeBalance' | 'unsubscribePrice' | 'unsubscribeBalance';
  token?: string;
  wallet?: string;
}

export interface PriceUpdate {
  type: 'PRICE_UPDATE';
  token: string;
  price: number;
  timestamp: number;
  slot?: number;
  txSignature?: string;
}

export interface BalanceUpdate {
  type: 'BALANCE_UPDATE';
  wallet: string;
  token: string;
  balance: number;
  timestamp: number;
}

// API types
export interface Token {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  imageUrl?: string;
  phase: 'bonding' | 'amm';
  price?: number;
  volume24h?: number;
  priceChange24h?: number;
}

export interface Trade {
  id: string;
  token: string;
  type: 'buy' | 'sell';
  amount: number;
  price: number;
  timestamp: number;
  txSignature: string;
}

export interface Portfolio {
  wallet: string;
  totalValue: number;
  totalProfit: number;
  tokens: Array<{
    token: string;
    balance: number;
    value: number;
    profit: number;
  }>;
}
```

## State Management

### Zustand Store Example

```typescript
// src/stores/tradingStore.ts
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

interface Price {
  value: number;
  timestamp: number;
  change24h?: number;
}

interface TradingState {
  prices: Map<string, Price>;
  balances: Map<string, number>;
  watchlist: string[];
  
  updatePrice: (token: string, price: number, timestamp: number) => void;
  updateBalance: (token: string, balance: number) => void;
  addToWatchlist: (token: string) => void;
  removeFromWatchlist: (token: string) => void;
}

export const useTradingStore = create<TradingState>()(
  subscribeWithSelector((set) => ({
    prices: new Map(),
    balances: new Map(),
    watchlist: [],
    
    updatePrice: (token, price, timestamp) =>
      set((state) => {
        const newPrices = new Map(state.prices);
        const current = newPrices.get(token);
        newPrices.set(token, {
          value: price,
          timestamp,
          change24h: current ? ((price - current.value) / current.value) * 100 : 0,
        });
        return { prices: newPrices };
      }),
    
    updateBalance: (token, balance) =>
      set((state) => {
        const newBalances = new Map(state.balances);
        newBalances.set(token, balance);
        return { balances: newBalances };
      }),
    
    addToWatchlist: (token) =>
      set((state) => ({
        watchlist: [...new Set([...state.watchlist, token])],
      })),
    
    removeFromWatchlist: (token) =>
      set((state) => ({
        watchlist: state.watchlist.filter((t) => t !== token),
      })),
  }))
);
```

## Error Handling

### Comprehensive Error Handler

```typescript
// src/utils/errorHandler.ts
import { Alert } from 'react-native';

export enum ErrorType {
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  SUBSCRIPTION_FAILED = 'SUBSCRIPTION_FAILED',
  API_ERROR = 'API_ERROR',
  WALLET_ERROR = 'WALLET_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
}

export class TradingError extends Error {
  constructor(
    public type: ErrorType,
    public message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'TradingError';
  }
}

export const handleError = (error: any): void => {
  console.error('Error:', error);
  
  if (error instanceof TradingError) {
    switch (error.type) {
      case ErrorType.CONNECTION_FAILED:
        Alert.alert(
          'Connection Failed',
          'Unable to connect to the trading server. Please check your internet connection and try again.',
          [{ text: 'OK' }]
        );
        break;
        
      case ErrorType.AUTHENTICATION_FAILED:
        Alert.alert(
          'Authentication Failed',
          'Failed to authenticate with your wallet. Please try connecting again.',
          [{ text: 'OK' }]
        );
        break;
        
      case ErrorType.WALLET_ERROR:
        Alert.alert(
          'Wallet Error',
          error.message || 'An error occurred with your wallet connection.',
          [{ text: 'OK' }]
        );
        break;
        
      default:
        Alert.alert('Error', error.message, [{ text: 'OK' }]);
    }
  } else {
    // Generic error
    Alert.alert(
      'Unexpected Error',
      'An unexpected error occurred. Please try again.',
      [{ text: 'OK' }]
    );
  }
};
```

### Using Error Boundaries

```typescript
// src/components/ErrorBoundary.tsx
import React, { Component, ReactNode } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
  };
  
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }
  
  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Error boundary caught:', error, errorInfo);
    // Log to error reporting service
  }
  
  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };
  
  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </Text>
          <Button title="Try Again" onPress={this.handleReset} />
        </View>
      );
    }
    
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    color: '#666',
  },
});
```

## Best Practices

### 1. Connection Management

```typescript
// src/contexts/WebSocketContext.tsx
import React, { createContext, useContext, useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import WebSocketManager from '../services/WebSocketManager';

const WebSocketContext = createContext<WebSocketManager | null>(null);

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const wsManager = useRef<WebSocketManager | null>(null);
  
  useEffect(() => {
    // Initialize WebSocket
    wsManager.current = new WebSocketManager(WS_URL);
    
    // Monitor network connectivity
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected) {
        wsManager.current?.connect();
      } else {
        wsManager.current?.disconnect();
      }
    });
    
    return () => {
      unsubscribe();
      wsManager.current?.disconnect();
    };
  }, []);
  
  return (
    <WebSocketContext.Provider value={wsManager.current}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocketContext = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within WebSocketProvider');
  }
  return context;
};
```

### 2. Performance Optimization

```typescript
// Memoize price components to prevent unnecessary re-renders
export const MemoizedPriceDisplay = React.memo(PriceDisplay, (prevProps, nextProps) => {
  return prevProps.tokenMint === nextProps.tokenMint;
});

// Throttle price updates to prevent UI jank
import { throttle } from 'lodash';

const throttledPriceUpdate = throttle((price: number) => {
  setPrice(price);
}, 100); // Update at most every 100ms
```

### 3. Offline Support

```typescript
// src/services/OfflineManager.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

export class OfflineManager {
  static async cachePrice(token: string, price: number): Promise<void> {
    const key = `price_${token}`;
    const data = { price, timestamp: Date.now() };
    await AsyncStorage.setItem(key, JSON.stringify(data));
  }
  
  static async getCachedPrice(token: string): Promise<{ price: number; timestamp: number } | null> {
    const key = `price_${token}`;
    const data = await AsyncStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  }
  
  static async cacheUserData(wallet: string, data: any): Promise<void> {
    const key = `user_${wallet}`;
    await AsyncStorage.setItem(key, JSON.stringify(data));
  }
}
```

### 4. Testing

```typescript
// __tests__/WebSocketManager.test.ts
import WS from 'jest-websocket-mock';
import WebSocketManager from '../src/services/WebSocketManager';

describe('WebSocketManager', () => {
  let server: WS;
  let manager: WebSocketManager;
  
  beforeEach(async () => {
    server = new WS('ws://localhost:1234');
    manager = new WebSocketManager('ws://localhost:1234');
  });
  
  afterEach(() => {
    WS.clean();
  });
  
  test('connects successfully', async () => {
    manager.connect();
    await server.connected;
    expect(manager.isConnected).toBe(true);
  });
  
  test('handles price updates', async () => {
    const mockCallback = jest.fn();
    manager.on('priceUpdate', mockCallback);
    
    manager.connect();
    await server.connected;
    
    const priceUpdate = {
      type: 'PRICE_UPDATE',
      token: 'SOL',
      price: 125.45,
      timestamp: Date.now(),
    };
    
    server.send(JSON.stringify(priceUpdate));
    
    expect(mockCallback).toHaveBeenCalledWith(priceUpdate);
  });
});
```

## Production Checklist

- [ ] Replace development URLs with production endpoints
- [ ] Implement proper error tracking (Sentry, Bugsnag)
- [ ] Add analytics for WebSocket events
- [ ] Implement retry logic with exponential backoff
- [ ] Test on various network conditions
- [ ] Handle app backgrounding/foregrounding
- [ ] Implement proper authentication flow
- [ ] Add connection status indicators
- [ ] Cache critical data for offline access
- [ ] Implement proper logging (but avoid sensitive data)

## Troubleshooting

### Common Issues

1. **WebSocket won't connect**
   - Check if using correct URL (AWS vs Cloudflare)
   - Verify network permissions in Info.plist/AndroidManifest
   - Check if authentication is required

2. **Missing price updates**
   - Verify subscription message format
   - Check if token address is correct
   - Look for WebSocket connection drops

3. **Authentication failures**
   - Ensure nonce is fresh (< 5 minutes old)
   - Verify signature encoding (base58)
   - Check wallet adapter compatibility

4. **Performance issues**
   - Throttle update frequency
   - Use React.memo for price components
   - Implement virtualized lists for large datasets

## Image Uploads

For a complete guide on uploading token images and user profile pictures, see the [Image Upload Guide](IMAGE-UPLOAD-GUIDE.md). It includes:
- Presigned URL generation
- Direct S3 uploads from React Native
- Image compression and optimization
- Complete code examples

## Support

For backend-specific issues, check the [backend documentation](../README.md).
For React Native issues, refer to the [React Native docs](https://reactnative.dev/). 