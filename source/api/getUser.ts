import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";

const client = new DynamoDBClient({});

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const wallet = event.pathParameters?.wallet;
    
    if (!wallet) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "wallet parameter is required" }),
      };
    }
    
    // Get user data from DynamoDB
    const result = await client.send(
      new GetCommand({
        TableName: Resource.UsersTable.name,
        Key: { wallet },
      })
    );
    
    if (!result.Item) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "User not found" }),
      };
    }
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet: result.Item.wallet,
        createdAt: result.Item.createdAt,
        referredBy: result.Item.referredBy,
        profileUrl: result.Item.profileUrl,
        tokensCreated: result.Item.tokensCreated || [],
        lastLogin: result.Item.lastLogin,
      }),
    };
    
  } catch (error) {
    console.error("Error getting user:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
}; 