import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import { z } from "zod";

const client = new DynamoDBClient({});

// Schema for update request
const UpdateUserSchema = z.object({
  profileUrl: z.string().url().optional(),
});

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
    
    // Parse and validate request body
    const body = JSON.parse(event.body || "{}");
    const updates = UpdateUserSchema.parse(body);
    
    // Build update expression
    const updateParts: string[] = ["#lastLogin = :lastLogin"];
    const expressionAttributeNames: Record<string, string> = {
      "#lastLogin": "lastLogin",
    };
    const expressionAttributeValues: Record<string, any> = {
      ":lastLogin": Math.floor(Date.now() / 1000),
    };
    
    // Add profile URL if provided
    if (updates.profileUrl) {
      updateParts.push("#profileUrl = :profileUrl");
      expressionAttributeNames["#profileUrl"] = "profileUrl";
      expressionAttributeValues[":profileUrl"] = updates.profileUrl;
    }
    
    // Update user data
    await client.send(
      new UpdateCommand({
        TableName: Resource.UsersTable.name,
        Key: { wallet },
        UpdateExpression: `SET ${updateParts.join(", ")}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: "NONE",
      })
    );
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true }),
    };
    
  } catch (error) {
    console.error("Error updating user:", error);
    
    if (error instanceof z.ZodError) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          error: "Invalid request", 
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