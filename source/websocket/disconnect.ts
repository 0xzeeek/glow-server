import { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";

const client = new DynamoDBClient({});

export const handler: APIGatewayProxyHandler = async (event) => {
  const connectionId = event.requestContext.connectionId!;
  
  try {
    console.log(`WebSocket disconnected: ${connectionId}`);
    
    // Delete from PriceConnectionsTable
    try {
      await client.send(
        new DeleteCommand({
          TableName: Resource.PriceConnectionsTable.name,
          Key: { connectionId },
        })
      );
    } catch (error) {
      console.error("Error deleting from PriceConnectionsTable:", error);
    }
    
    // Delete from BalanceConnectionsTable
    try {
      await client.send(
        new DeleteCommand({
          TableName: Resource.BalanceConnectionsTable.name,
          Key: { connectionId },
        })
      );
    } catch (error) {
      console.error("Error deleting from BalanceConnectionsTable:", error);
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Disconnected" }),
    };
  } catch (error) {
    console.error("Disconnect error:", error);
    // Always return 200 for disconnect to avoid retries
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Disconnected with errors" }),
    };
  }
}; 