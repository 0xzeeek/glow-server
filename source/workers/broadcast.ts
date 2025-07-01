import { SQSHandler } from "aws-lambda";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";

// Initialize clients
const dynamoClient = new DynamoDBClient({});

export const handler: SQSHandler = async (event) => {
  for (const record of event.Records) {
    try {
      const { connectionIds, message } = JSON.parse(record.body);
      
      // If no specific connection IDs provided, query them based on the token
      let targetConnectionIds = connectionIds;
      
      if (!targetConnectionIds || targetConnectionIds.length === 0) {
        // Query connections subscribed to this token
        const result = await dynamoClient.send(
          new QueryCommand({
            TableName: Resource.PriceConnectionsTable.name,
            IndexName: "byToken",
            KeyConditionExpression: "token = :token",
            ExpressionAttributeValues: {
              ":token": message.token,
            },
          })
        );
        
        targetConnectionIds = result.Items?.map(item => item.connectionId) || [];
      }
      
      if (targetConnectionIds.length === 0) {
        console.log(`No connections found for token ${message.token}`);
        continue;
      }
      
      // Initialize API Gateway Management API client
      const endpoint = Resource.WebSocketApi.managementEndpoint;
      const apiClient = new ApiGatewayManagementApiClient({
        endpoint,
      });
      
      // Send message to all connected clients
      const messageStr = JSON.stringify(message);
      const promises = targetConnectionIds.map(async (connectionId: string) => {
        try {
          await apiClient.send(
            new PostToConnectionCommand({
              ConnectionId: connectionId,
              Data: new TextEncoder().encode(messageStr),
            })
          );
          console.log(`Sent message to connection ${connectionId}`);
        } catch (error: any) {
          if (error.statusCode === 410) {
            // Connection is stale, should be cleaned up
            console.log(`Stale connection detected: ${connectionId}`);
            // In production, you would delete this from the connections table
          } else {
            console.error(`Failed to send to ${connectionId}:`, error);
          }
        }
      });
      
      // Wait for all messages to be sent
      await Promise.allSettled(promises);
      
    } catch (error) {
      console.error("Error processing SQS message:", error);
      // In production, you might want to send this to a DLQ
      throw error;
    }
  }
}; 