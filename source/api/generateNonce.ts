import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { randomUUID } from "crypto";
import { Resource } from "sst";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const wallet = event.queryStringParameters?.wallet;

    if (!wallet) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "wallet parameter is required" }),
      };
    }

    const nonce = randomUUID();
    const expiresAt = Math.floor(Date.now() / 1000) + 600; // 10 minutes

    // Store nonce in DynamoDB
    await client.send(
      new PutCommand({
        TableName: Resource.WebsocketNonceTable.name,
        Item: {
          wallet,
          nonce,
          ttl: expiresAt,
        },
      })
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet,
        nonce,
        expiresAt: expiresAt * 1000, // Convert back to milliseconds
      }),
    };
  } catch (error) {
    console.error("Error generating nonce:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
}; 