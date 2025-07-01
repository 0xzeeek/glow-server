import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { z } from "zod";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { SQSClient, SendMessageBatchCommand } from "@aws-sdk/client-sqs";
import { Resource } from "sst";

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({});
const sqsClient = new SQSClient({});

// Schema for webhook payload
const HeliusPriceWebhookSchema = z.object({
  type: z.string(),
  accounts: z.array(
    z.object({
      address: z.string(),
      nativeBalanceChange: z.number(),
    })
  ),
  txSignature: z.string(),
  slot: z.number(),
  timestamp: z.number(),
});

// Function to calculate price from balance changes
function calculatePrice(accounts: { address: string; nativeBalanceChange: number }[]): number {
  // Simplified price calculation - in production, this would be more complex
  const solChange = accounts.find(acc => acc.address === "vault_sol")?.nativeBalanceChange || 0;
  const tokenChange = accounts.find(acc => acc.address === "user")?.nativeBalanceChange || 0;
  
  if (tokenChange === 0) return 0;
  
  // Price = SOL amount / token amount (converting lamports to SOL)
  return Math.abs(solChange / 1e9) / Math.abs(tokenChange);
}

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
    const payload = HeliusPriceWebhookSchema.parse(body);
    
    // Extract token from the request (this would come from webhook configuration)
    const token = event.headers["x-token"] || "DROP"; // Default to DROP for testing
    
    // Calculate price from transaction data
    const price = calculatePrice(payload.accounts);
    
    // Prepare price data
    const priceData = {
      token,
      timestamp: payload.timestamp,
      price,
      source: "amm",
      slot: payload.slot,
      txSignature: payload.txSignature,
    };
    
    // Get current date for partition key
    const date = new Date(payload.timestamp * 1000);
    const dateStr = date.toISOString().split("T")[0].replace(/-/g, "");
    
    // Calculate TTL (14 days from now)
    const ttl = Math.floor(Date.now() / 1000) + (14 * 24 * 60 * 60);
    
    // Write to DynamoDB time series table
    await dynamoClient.send(
      new PutCommand({
        TableName: Resource.PriceTimeSeriesTable.name,
        Item: {
          tokenDate: `${token}#${dateStr}`,
          timestamp: payload.timestamp,
          price,
          source: "amm",
          slot: payload.slot,
          txSignature: payload.txSignature,
          ttl,
        },
      })
    );
    
    // Prepare broadcast message
    const broadcastMessage = {
      type: "PRICE_UPDATE",
      token,
      price,
      timestamp: payload.timestamp,
      slot: payload.slot,
      txSignature: payload.txSignature,
    };
    
    // Check if we should use edge broadcast
    const useEdgeBroadcast = process.env.USE_EDGE_BROADCAST === "true";
    
    if (useEdgeBroadcast && process.env.EDGE_BROADCAST_URL && process.env.EDGE_BROADCAST_SECRET) {
      // Call Cloudflare edge worker
      try {
        const edgeUrl = `${process.env.EDGE_BROADCAST_URL}/broadcast/${token}`;
        const response = await fetch(edgeUrl, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.EDGE_BROADCAST_SECRET}`,
          },
          body: JSON.stringify(broadcastMessage),
        });
        
        if (!response.ok) {
          console.error(`Edge broadcast failed: ${response.status} ${await response.text()}`);
          // Fallback to SQS
          await broadcastViaSQS(broadcastMessage);
        } else {
          console.log(`Edge broadcast successful for ${token}`);
        }
      } catch (error) {
        console.error("Edge broadcast error:", error);
        // Fallback to SQS
        await broadcastViaSQS(broadcastMessage);
      }
    } else {
      // Send to SQS for AWS broadcast
      await broadcastViaSQS(broadcastMessage);
    }
    
    // Helper function to broadcast via SQS
    async function broadcastViaSQS(message: any) {
      // Get connected clients for this token
      // In production, this would query the PriceConnectionsTable
      // For now, we'll send a single message to the queue
      await sqsClient.send(
        new SendMessageBatchCommand({
          QueueUrl: Resource.BroadcastQueue.url,
          Entries: [
            {
              Id: "1",
              MessageBody: JSON.stringify({
                connectionIds: [], // Would be populated from PriceConnectionsTable
                message,
              }),
            },
          ],
        })
      );
    }
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "accepted" }),
    };
  } catch (error) {
    console.error("Error processing price webhook:", error);
    
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