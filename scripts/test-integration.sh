#!/bin/bash

# AWS-Cloudflare Integration Test Script
# This script tests both AWS and Cloudflare deployments

set -e

echo "🚀 AWS-Cloudflare Integration Test Suite"
echo "========================================"

# Configuration
AWS_API_URL=${AWS_API_URL:-"https://your-api.execute-api.us-east-1.amazonaws.com"}
CF_BROADCAST_URL=${CF_BROADCAST_URL:-"https://broadcast.yourdomain.com"}
WEBHOOK_SECRET=${WEBHOOK_SECRET:-"your-webhook-secret"}
TEST_TOKEN="TEST_TOKEN_$(date +%s)"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test function
test_endpoint() {
    local name=$1
    local url=$2
    local expected=$3
    
    echo -n "Testing $name... "
    response=$(curl -s -w "\n%{http_code}" "$url")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" = "$expected" ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $http_code)"
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} (HTTP $http_code)"
        echo "  Response: $body"
        return 1
    fi
}

# Test POST endpoint
test_post() {
    local name=$1
    local url=$2
    local data=$3
    local headers=$4
    local expected=$5
    
    echo -n "Testing $name... "
    response=$(curl -s -w "\n%{http_code}" -X POST "$url" \
        -H "Content-Type: application/json" \
        $headers \
        -d "$data")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" = "$expected" ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $http_code)"
        echo "  Response: $body"
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} (HTTP $http_code)"
        echo "  Response: $body"
        return 1
    fi
}

echo ""
echo "1. Testing AWS Backend"
echo "----------------------"

# Test AWS health endpoint
test_endpoint "AWS Health Check" "$AWS_API_URL/health/live" "200"

# Test AWS token price endpoint
test_endpoint "AWS Get Price" "$AWS_API_URL/tokens/SOL/price" "200"

echo ""
echo "2. Testing Cloudflare Edge (if deployed)"
echo "----------------------------------------"

# Test Cloudflare health endpoint
if test_endpoint "Cloudflare Health" "$CF_BROADCAST_URL/health" "200"; then
    CF_DEPLOYED=true
else
    CF_DEPLOYED=false
    echo -e "${YELLOW}⚠ Cloudflare not deployed or not accessible${NC}"
fi

echo ""
echo "3. Testing Integration Flow"
echo "---------------------------"

if [ "$CF_DEPLOYED" = true ]; then
    # Test webhook to Cloudflare broadcast
    test_post "Broadcast via Cloudflare" \
        "$CF_BROADCAST_URL/broadcast/$TEST_TOKEN" \
        '{"type":"PRICE_UPDATE","price":123.45,"timestamp":'$(date +%s)'}' \
        "-H \"Authorization: Bearer $WEBHOOK_SECRET\"" \
        "200"
fi

# Test webhook to AWS
WEBHOOK_DATA='{
    "type": "PRICE_UPDATE",
    "accounts": [
        {"address": "vault_sol", "nativeBalanceChange": 1000000000},
        {"address": "user", "nativeBalanceChange": -1000000}
    ],
    "txSignature": "test'$(date +%s)'",
    "slot": 123456,
    "timestamp": '$(date +%s)'
}'

test_post "Price Webhook to AWS" \
    "$AWS_API_URL/webhook/price" \
    "$WEBHOOK_DATA" \
    "-H \"x-token: $TEST_TOKEN\"" \
    "200"

echo ""
echo "4. WebSocket Connection Test"
echo "----------------------------"

# Create a simple WebSocket test
cat > /tmp/ws-test.js << 'EOF'
const WebSocket = require('ws');

const urls = [
    process.env.AWS_WS_URL,
    process.env.CF_WS_URL
].filter(Boolean);

urls.forEach(url => {
    if (!url || url.includes('your-')) return;
    
    console.log(`Testing WebSocket: ${url}`);
    const ws = new WebSocket(url);
    
    ws.on('open', () => {
        console.log('✓ Connected successfully');
        ws.close();
    });
    
    ws.on('error', (err) => {
        console.log('✗ Connection failed:', err.message);
    });
});

setTimeout(() => process.exit(0), 5000);
EOF

if command -v node &> /dev/null; then
    AWS_WS_URL="$AWS_API_URL" CF_WS_URL="wss://broadcast.yourdomain.com/ws/$TEST_TOKEN" \
    node /tmp/ws-test.js 2>/dev/null || echo "WebSocket test requires 'ws' package (npm install -g ws)"
else
    echo -e "${YELLOW}⚠ Node.js not found, skipping WebSocket test${NC}"
fi

rm -f /tmp/ws-test.js

echo ""
echo "5. Summary"
echo "----------"

if [ "$CF_DEPLOYED" = true ]; then
    echo -e "${GREEN}✓ AWS Backend: Operational${NC}"
    echo -e "${GREEN}✓ Cloudflare Edge: Operational${NC}"
    echo -e "${GREEN}✓ Integration: Working${NC}"
    echo ""
    echo "Your AWS + Cloudflare integration is fully operational! 🎉"
else
    echo -e "${GREEN}✓ AWS Backend: Operational${NC}"
    echo -e "${YELLOW}⚠ Cloudflare Edge: Not deployed${NC}"
    echo ""
    echo "AWS backend is working. Deploy Cloudflare for edge broadcasting."
fi

echo ""
echo "Next Steps:"
echo "1. Update the URLs in this script with your actual endpoints"
echo "2. Set your actual webhook secret: export WEBHOOK_SECRET='your-secret'"
echo "3. Run this script after each deployment to verify everything works"

echo ""
echo "For detailed logs:"
echo "- AWS: aws logs tail /aws/lambda/YOUR-FUNCTION-NAME"
echo "- Cloudflare: cd cloudflare && npx wrangler tail" 