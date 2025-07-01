import { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { Resource } from "sst";
import { z } from "zod";

const dynamoClient = new DynamoDBClient({});

const SubscribePriceSchema = z.object({
  token: z.string().min(1),
});

export const handler: APIGatewayProxyHandler = async (event) => {
  const connectionId = event.requestContext.connectionId!;
  const endpoint = `https://${event.requestContext.domainName}/${event.requestContext.stage}`;
  
  const apiClient = new ApiGatewayManagementApiClient({ endpoint });
  
  try {
    // Parse and validate request
    const body = JSON.parse(event.body || "{}");
    const { token } = SubscribePriceSchema.parse(body);
    
    console.log(`Subscribing ${connectionId} to price updates for ${token}`);
    
    // Calculate TTL (1 hour from now)
    const ttl = Math.floor(Date.now() / 1000) + 3600;
    
    // Store subscription in DynamoDB
    await dynamoClient.send(
      new PutCommand({
        TableName: Resource.PriceConnectionsTable.name,
        Item: {
          connectionId,
          token,
          ttl,
        },
      })
    );
    
    // Send confirmation message
    const confirmationMessage = {
      type: "SUBSCRIPTION_CONFIRMED",
      subscription: "price",
      token,
      message: `Subscribed to price updates for ${token}`,
    };
    
    await apiClient.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: new TextEncoder().encode(JSON.stringify(confirmationMessage)),
      })
    );
    
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Subscribed successfully" }),
    };
    
  } catch (error) {
    console.error("Subscribe price error:", error);
    
    let errorMessage = "Subscription failed";
    if (error instanceof z.ZodError) {
      errorMessage = "Invalid request: token is required";
    }
    
    // Try to send error message to client
    try {
      await apiClient.send(
        new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: new TextEncoder().encode(JSON.stringify({
            type: "ERROR",
            code: "SUBSCRIPTION_FAILED",
            message: errorMessage,
          })),
        })
      );
    } catch (sendError) {
      console.error("Failed to send error message:", sendError);
    }
    
    return {
      statusCode: 400,
      body: JSON.stringify({ error: errorMessage }),
    };
  }
}; 