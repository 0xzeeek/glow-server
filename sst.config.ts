/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "server",
      region: "us-east-1",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
    };
  },
  async run() {
    /* --------------------------------------------
    // DynamoDB Tables
    -------------------------------------------- */

    // 1. PriceConnectionsTable - Map WebSocket → token
    const priceConnectionsTable = new sst.aws.Dynamo("PriceConnectionsTable", {
      fields: {
        connectionId: "string", // Partition key
        token: "string",
        ttl: "number",
      },
      primaryIndex: { hashKey: "connectionId" },
      globalIndexes: {
        byToken: {
          hashKey: "token",
          rangeKey: "connectionId",
        },
      },
      ttl: "ttl",
    });

    // 2. BalanceConnectionsTable - Map WebSocket → wallet
    const balanceConnectionsTable = new sst.aws.Dynamo("BalanceConnectionsTable", {
      fields: {
        connectionId: "string", // Partition key
        wallet: "string",
        ttl: "number",
      },
      primaryIndex: { hashKey: "connectionId" },
      globalIndexes: {
        byWallet: {
          hashKey: "wallet",
        },
      },
      ttl: "ttl",
    });

    // 3. PriceTimeSeriesTable - 14-day hot chart cache
    const priceTimeSeriesTable = new sst.aws.Dynamo("PriceTimeSeriesTable", {
      fields: {
        tokenDate: "string", // PK: token#YYYYMMDD
        timestamp: "number", // SK
        price: "number",
        source: "string",
        slot: "number",
        txSignature: "string",
        ttl: "number",
      },
      primaryIndex: { 
        hashKey: "tokenDate",
        rangeKey: "timestamp",
      },
      ttl: "ttl",
    });

    // 4. BalanceSnapshotsTable - Immutable balance snapshots for P+L
    const balanceSnapshotsTable = new sst.aws.Dynamo("BalanceSnapshotsTable", {
      fields: {
        walletToken: "string", // PK: wallet#token
        timestamp: "number", // SK
        balance: "number",
        price: "number",
        valueUsd: "number",
      },
      primaryIndex: { 
        hashKey: "walletToken",
        rangeKey: "timestamp",
      },
    });

    // 5. TokensTable - Metadata for every coin
    const tokensTable = new sst.aws.Dynamo("TokensTable", {
      fields: {
        token: "string", // PK
        symbol: "string",
        name: "string",
        decimals: "number",
        imageUrl: "string",
        phase: "string", // "bonding" or "amm"
        ammPool: "string",
        createdAt: "number",
        transitionedAt: "number",
        description: "string",
      },
      primaryIndex: { hashKey: "token" },
      globalIndexes: {
        byPhase: {
          hashKey: "phase",
        },
      },
    });

    // 6. UsersTable - Trader profile & referrals
    const usersTable = new sst.aws.Dynamo("UsersTable", {
      fields: {
        wallet: "string", // PK
        createdAt: "number",
        referredBy: "string",
        profileUrl: "string",
        lastLogin: "number",
      },
      primaryIndex: { hashKey: "wallet" },
    });

    // 7. WebsocketNonceTable - One-time auth nonces
    const websocketNonceTable = new sst.aws.Dynamo("WebsocketNonceTable", {
      fields: {
        wallet: "string", // PK
        nonce: "string",
        ttl: "number",
      },
      primaryIndex: { hashKey: "wallet" },
      ttl: "ttl",
    });

    /* --------------------------------------------
    // Messaging Resources
    -------------------------------------------- */

    // Dead Letter Queue for broadcast messages
    const broadcastDLQ = new sst.aws.Queue("BroadcastDLQ", {
      visibilityTimeout: "30 seconds",
    });

    // SQS Queue for decoupling price writers from socket fan-out
    const broadcastQueue = new sst.aws.Queue("BroadcastQueue", {
      visibilityTimeout: "30 seconds",
      dlq: {
        queue: broadcastDLQ.arn,
        retry: 3,
      },
    });

    /* --------------------------------------------
    // S3 Buckets
    -------------------------------------------- */

    // Token metadata bucket
    const tokenMetadataBucket = new sst.aws.Bucket("TokenMetadataBucket", {
    });

    // User profile bucket
    const userProfileBucket = new sst.aws.Bucket("UserProfileBucket", {
    });

    /* --------------------------------------------
    // CloudFront Distributions
    -------------------------------------------- */

    // CDN configuration would go here
    // For now, buckets can be accessed directly or through CloudFront configured separately

    /* --------------------------------------------
    // Secrets
    -------------------------------------------- */

    const heliusApiKey = new sst.Secret("HeliusApiKey");
    const jupiterApiKey = new sst.Secret("JupiterApiKey");
    const rpcUrl = new sst.Secret("RpcUrl");
    const edgeBroadcastUrl = new sst.Secret("EdgeBroadcastUrl");
    const edgeBroadcastSecret = new sst.Secret("EdgeBroadcastSecret");

    /* --------------------------------------------
    // WebSocket API
    -------------------------------------------- */

    const wsApi = new sst.aws.ApiGatewayWebSocket("WebSocketApi");

    // WebSocket route handlers
    const connectHandler = new sst.aws.Function("ConnectHandler", {
      handler: "source/websocket/connect.handler",
      link: [websocketNonceTable],
    });

    const disconnectHandler = new sst.aws.Function("DisconnectHandler", {
      handler: "source/websocket/disconnect.handler",
      link: [priceConnectionsTable, balanceConnectionsTable],
    });

    const subscribePriceHandler = new sst.aws.Function("SubscribePriceHandler", {
      handler: "source/websocket/subscribePrice.handler",
      link: [priceConnectionsTable],
    });

    const subscribeBalanceHandler = new sst.aws.Function("SubscribeBalanceHandler", {
      handler: "source/websocket/subscribeBalance.handler",
      link: [balanceConnectionsTable],
    });

    wsApi.route("$connect", connectHandler.arn);
    wsApi.route("$disconnect", disconnectHandler.arn);
    wsApi.route("subscribePrice", subscribePriceHandler.arn);
    wsApi.route("subscribeBalance", subscribeBalanceHandler.arn);

    /* --------------------------------------------
    // REST API
    -------------------------------------------- */

    const restApi = new sst.aws.ApiGatewayV2("RestApi");

    /* --------------------------------------------
    // Lambda Functions
    -------------------------------------------- */

    // Webhook handlers
    const heliusPriceWebhook = new sst.aws.Function("HeliusPriceWebhook", {
      handler: "source/webhooks/heliusPrice.handler",
      link: [priceTimeSeriesTable, broadcastQueue, heliusApiKey],
      environment: {
        USE_EDGE_BROADCAST: process.env.USE_EDGE_BROADCAST || "false",
        EDGE_BROADCAST_URL: edgeBroadcastUrl.value,
        EDGE_BROADCAST_SECRET: edgeBroadcastSecret.value,
      },
    });

    const heliusBalanceWebhook = new sst.aws.Function("HeliusBalanceWebhook", {
      handler: "source/webhooks/heliusBalance.handler",
      link: [balanceConnectionsTable, wsApi, heliusApiKey],
    });

    // Broadcast worker for SQS messages
    const broadcastWorker = new sst.aws.Function("BroadcastWorker", {
      handler: "source/workers/broadcast.handler",
      link: [wsApi, priceConnectionsTable],
    });

    broadcastQueue.subscribe(broadcastWorker.arn);

    // API handlers
    const getLatestPrice = new sst.aws.Function("GetLatestPrice", {
      handler: "source/api/getLatestPrice.handler",
      link: [priceTimeSeriesTable],
    });

    const getTokenPrices = new sst.aws.Function("GetTokenPrices", {
      handler: "source/api/getTokenPrices.handler",
      link: [priceTimeSeriesTable],
    });

    const getTokenMetadata = new sst.aws.Function("GetTokenMetadata", {
      handler: "source/api/getTokenMetadata.handler",
      link: [tokensTable],
    });

    const updateTokenMetadata = new sst.aws.Function("UpdateTokenMetadata", {
      handler: "source/api/updateTokenMetadata.handler",
      link: [tokensTable, tokenMetadataBucket],
    });

    const getUser = new sst.aws.Function("GetUser", {
      handler: "source/api/getUser.handler",
      link: [usersTable],
    });

    const updateUser = new sst.aws.Function("UpdateUser", {
      handler: "source/api/updateUser.handler",
      link: [usersTable, userProfileBucket],
    });

    const getUserPnL = new sst.aws.Function("GetUserPnL", {
      handler: "source/api/getUserPnL.handler",
      link: [balanceSnapshotsTable],
    });

    const getUserAggregatePnL = new sst.aws.Function("GetUserAggregatePnL", {
      handler: "source/api/getUserAggregatePnL.handler",
      link: [balanceSnapshotsTable],
    });

    const generateNonce = new sst.aws.Function("GenerateNonce", {
      handler: "source/api/generateNonce.handler",
      link: [websocketNonceTable],
    });

    const healthcheck = new sst.aws.Function("Healthcheck", {
      handler: "source/api/healthcheck.handler",
    });

    const uploadTokenImage = new sst.aws.Function("UploadTokenImage", {
      handler: "source/api/uploadTokenImage.handler",
      link: [tokenMetadataBucket],
    });

    const uploadUserImage = new sst.aws.Function("UploadUserImage", {
      handler: "source/api/uploadUserImage.handler",
      link: [userProfileBucket],
    });

    /* --------------------------------------------
    // Jobs & Cron
    -------------------------------------------- */

    // Fetch AMM prices job
    const fetchAMMPrice = new sst.aws.Function("FetchAMMPrice", {
      handler: "source/jobs/fetchAMMPrice.handler",
      link: [tokensTable, priceTimeSeriesTable, broadcastQueue],
      environment: {
        JUPITER_API_KEY: jupiterApiKey.value,
      },
      timeout: "1 minute",
    });

    // Note: Step Functions for controlled AMM price fetching
    // Simplified for now - can add back when scale requires it

    // Price fetcher cron (every 30 seconds)
    new sst.aws.Cron("PriceFetcherCron", {
      function: fetchAMMPrice.arn,
      schedule: "rate(30 seconds)",
    });

    // Snapshot balances job
    const snapshotBalances = new sst.aws.Function("SnapshotBalances", {
      handler: "source/jobs/snapshotBalances.handler",
      link: [balanceSnapshotsTable, priceTimeSeriesTable, tokensTable],
      environment: {
        RPC_URL: rpcUrl.value,
      },
      timeout: "5 minutes",
    });

    new sst.aws.Cron("SnapshotBalancesCron", {
      function: snapshotBalances.arn,
      schedule: "rate(1 minute)",
    });

    // TTL sweeper job
    const ttlSweeper = new sst.aws.Function("TtlSweeper", {
      handler: "source/jobs/ttlSweeper.handler",
      link: [priceConnectionsTable, balanceConnectionsTable, websocketNonceTable],
      timeout: "5 minutes",
    });

    new sst.aws.Cron("TtlSweeperCron", {
      function: ttlSweeper.arn,
      schedule: "rate(5 minutes)",
    });

    // Note: Kinesis and S3 archival removed for simplicity
    // Can be added later when scale requires it

    /* --------------------------------------------
    // API Routes
    -------------------------------------------- */

    // Webhook endpoints
    restApi.route("POST /webhook/price", heliusPriceWebhook.arn);
    restApi.route("POST /webhook/balance", heliusBalanceWebhook.arn);

    // Token endpoints
    restApi.route("GET /tokens/{mint}/price", getLatestPrice.arn);
    restApi.route("GET /tokens/{mint}/prices", getTokenPrices.arn);
    restApi.route("GET /tokens/{mint}", getTokenMetadata.arn);
    restApi.route("PUT /tokens/{mint}", updateTokenMetadata.arn);
    restApi.route("POST /tokens/{mint}/image", uploadTokenImage.arn);

    // User endpoints
    restApi.route("GET /users/{wallet}", getUser.arn);
    restApi.route("PUT /users/{wallet}", updateUser.arn);
    restApi.route("GET /users/{wallet}/pnl", getUserPnL.arn);
    restApi.route("GET /users/{wallet}/pnl/aggregate", getUserAggregatePnL.arn);
    restApi.route("POST /users/{wallet}/image", uploadUserImage.arn);

    // Auth & health endpoints
    restApi.route("GET /login/nonce", generateNonce.arn);
    restApi.route("GET /health/live", healthcheck.arn);

    /* --------------------------------------------
    // Outputs
    -------------------------------------------- */

    return {
      WebSocketUrl: wsApi.url,
      RestApiUrl: restApi.url,
    };
  },
});
