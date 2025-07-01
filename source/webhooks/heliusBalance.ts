import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { z } from "zod";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { Resource } from "sst";

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({});

// Schema for balance webhook payload
const HeliusBalanceWebhookSchema = z.object({
  wallet: z.string(),
  token: z.string(),
  balance: z.number(),
  slot: z.number(),
  timestamp: z.number(),
});

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    // Verify webhook authentication
    const authHeader = event.headers["authorization"] || event.headers["Authorization"];
    const expectedAuth = `Bearer ${Resource.HeliusApiKey.value}`;
    
    if (authHeader !== expectedAuth) {
      console.error("Unauthorized webhook request");
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }
    
    // Parse and validate webhook payload
    const body = JSON.parse(event.body || "{}");
    const payload = HeliusBalanceWebhookSchema.parse(body);
    
    // Query connections subscribed to this wallet
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: Resource.BalanceConnectionsTable.name,
        IndexName: "byWallet",
        KeyConditionExpression: "wallet = :wallet",
        ExpressionAttributeValues: {
          ":wallet": payload.wallet,
        },
      })
    );
    
    const connectionIds = result.Items?.map(item => item.connectionId) || [];
    
    if (connectionIds.length === 0) {
      console.log(`No connections found for wallet ${payload.wallet}`);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "accepted" }),
      };
    }
    
    // Initialize API Gateway Management API client
    const endpoint = Resource.WebSocketApi.managementEndpoint;
    const apiClient = new ApiGatewayManagementApiClient({ endpoint });
    
    // Prepare balance update message
    const message = {
      type: "BALANCE_UPDATE",
      wallet: payload.wallet,
      token: payload.token,
      balance: payload.balance,
      valueUsd: 0, // Would be calculated based on current price
      timestamp: payload.timestamp,
    };
    
    // Send to all connected clients
    const messageStr = JSON.stringify(message);
    const promises = connectionIds.map(async (connectionId: string) => {
      try {
        await apiClient.send(
          new PostToConnectionCommand({
            ConnectionId: connectionId,
            Data: new TextEncoder().encode(messageStr),
          })
        );
        console.log(`Sent balance update to connection ${connectionId}`);
      } catch (error: any) {
        if (error.statusCode === 410) {
          console.log(`Stale connection detected: ${connectionId}`);
          // In production, delete this connection
        } else {
          console.error(`Failed to send to ${connectionId}:`, error);
        }
      }
    });
    
    await Promise.allSettled(promises);
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "accepted" }),
    };
  } catch (error) {
    console.error("Error processing balance webhook:", error);
    
    if (error instanceof z.ZodError) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          error: "Invalid payload", 
          details: error.errors 
        }),
      };
    }
    
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
}; 