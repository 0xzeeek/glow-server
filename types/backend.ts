/**
 * Solana Trading Backend Type Definitions
 * 
 * Copy this file to your React Native project's types folder
 * and import as needed:
 * 
 * import { PriceUpdate, TokenMetadata } from '@/types/solana-trading-backend';
 */

// WebSocket Message Types
export interface WSConnectParams {
  wallet: string;
  signature: string;
  nonce: string;
}

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

// API Response Types
export interface TokenMetadata {
  token: string;
  symbol: string;
  name: string;
  decimals: number;
  imageUrl?: string;
  phase: 'bonding' | 'amm';
  ammPool?: string;
  createdAt?: number;
  transitionedAt?: number;
  description?: string;
}

export interface PricePoint {
  timestamp: number;
  price: number;
  source?: string;
  slot?: number;
  txSignature?: string;
}

export interface UserProfile {
  wallet: string;
  createdAt: number;
  referredBy?: string;
  profileUrl?: string;
  lastLogin: number;
}

export interface TokenPnL {
  token: string;
  invested: number;
  current: number;
  profit: number;
  profitPercent: number;
  firstBuy: number;
  lastUpdate: number;
}

export interface AggregatePnL {
  totalInvested: number;
  totalCurrent: number;
  totalProfit: number;
  profitPercent: number;
  tokenCount: number;
}

// API Request Types
export interface GetPricesParams {
  range?: '1h' | '24h' | '7d' | '30d';
  resolution?: '1m' | '5m' | '15m' | '1h' | '1d';
}

export interface UpdateTokenMetadataParams {
  symbol?: string;
  name?: string;
  imageUrl?: string;
  description?: string;
}

export interface UpdateUserParams {
  referredBy?: string;
  profileUrl?: string;
}

// API Responses
export interface HealthCheckResponse {
  status: 'ok';
  timestamp: string;
}

export interface NonceResponse {
  nonce: string;
  expiresAt: number;
}

export interface LatestPriceResponse {
  token: string;
  price: number;
  timestamp: number;
  source: string;
}

export interface TokenPricesResponse {
  token: string;
  prices: PricePoint[];
  range: string;
  count: number;
}

export interface UserPnLResponse {
  wallet: string;
  tokens: TokenPnL[];
  timestamp: number;
}

// Error Types
export interface APIError {
  error: string;
  message: string;
  statusCode: number;
}

// Helper Types
export type TokenAddress = string;
export type WalletAddress = string;
export type UnixTimestamp = number;
export type TokenAmount = number; 