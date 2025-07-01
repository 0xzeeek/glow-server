# Simplified Architecture

## Overview

This backend is designed to start simple and scale as needed. We're using DynamoDB for all data storage initially, which can handle millions of records efficiently.

## Current Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Helius         │────▶│  Lambda      │────▶│  DynamoDB       │
│  Webhooks       │     │  Handlers    │     │  Tables         │
└─────────────────┘     └──────────────┘     └─────────────────┘
                               │                      ▲
                               │                      │
                               ▼                      │
                        ┌──────────────┐              │
                        │  SQS Queue   │              │
                        └──────────────┘              │
                               │                      │
                               ▼                      │
                        ┌──────────────┐              │
                        │  Broadcast    │◀─────────────
                        │  Worker       │
                        └──────────────┘
                               │
                               ▼
                        ┌──────────────┐
                        │  WebSocket   │
                        │  Clients      │
                        └──────────────┘
```

## Data Flow

1. **Price Updates**:
   - Helius sends webhook → Lambda handler
   - Lambda writes to DynamoDB (PriceTimeSeriesTable)
   - Lambda sends message to SQS
   - Broadcast worker sends to connected WebSocket clients

2. **Historical Data**:
   - All stored in DynamoDB with TTL
   - 14-day retention for price data
   - Automatic cleanup of expired records

3. **Client Connections**:
   - WebSocket clients connect to API Gateway
   - Connection IDs stored in DynamoDB
   - Real-time updates via broadcast worker

## Key Benefits

- **Simple**: Fewer moving parts to manage
- **Cost Effective**: ~$2,950/month at 100K users
- **Reliable**: DynamoDB handles scaling automatically
- **Fast**: < 100ms latency for most operations

## Future Scaling Options

When you need to scale beyond DynamoDB:

1. **Add Kinesis** for real-time streaming (at ~1M users)
2. **Add S3 + Athena** for long-term analytics (at ~10M records)
3. **Add ElastiCache** for sub-10ms reads (at extreme scale)
4. **Add CloudFront** for global distribution

But for now, this simplified architecture will handle your first 100K-500K users efficiently! 