#!/bin/bash

# Deployment script for Solana Trading Backend

set -e

STAGE=${1:-dev}

echo "🚀 Deploying to stage: $STAGE"

# Check if required environment variables are set
if [ "$STAGE" == "production" ]; then
    if [ -z "$HELIUS_API_KEY" ] || [ -z "$JUPITER_API_KEY" ] || [ -z "$RPC_URL" ]; then
        echo "❌ Error: Required environment variables not set for production"
        echo "Please set: HELIUS_API_KEY, JUPITER_API_KEY, RPC_URL"
        exit 1
    fi
fi

# Set secrets if environment variables are present
if [ ! -z "$HELIUS_API_KEY" ]; then
    echo "📝 Setting HeliusApiKey secret..."
    npx sst secret set HeliusApiKey "$HELIUS_API_KEY" --stage $STAGE
fi

if [ ! -z "$JUPITER_API_KEY" ]; then
    echo "📝 Setting JupiterApiKey secret..."
    npx sst secret set JupiterApiKey "$JUPITER_API_KEY" --stage $STAGE
fi

if [ ! -z "$RPC_URL" ]; then
    echo "📝 Setting RpcUrl secret..."
    npx sst secret set RpcUrl "$RPC_URL" --stage $STAGE
fi

# Deploy the stack
echo "🏗️  Deploying SST stack..."
npx sst deploy --stage $STAGE

echo "✅ Deployment complete!"

# Show outputs
echo ""
echo "📋 Stack outputs:"
npx sst diff --stage $STAGE | grep -A 20 "Outputs:" 