import { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import { Resource } from "sst";

const client = new DynamoDBClient({});

export const handler: APIGatewayProxyHandler = async (event) => {
  const connectionId = event.requestContext.connectionId!;
  
  try {
    // Extract wallet and signature from headers
    const wallet = event.headers?.wallet || event.queryStringParameters?.wallet;
    const signature = event.headers?.signature || event.queryStringParameters?.signature;
    const message = event.headers?.message || event.queryStringParameters?.message;

    if (!wallet || !signature || !message) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Missing authentication parameters" }),
      };
    }

    // Get nonce from database
    const nonceResult = await client.send(
      new GetCommand({
        TableName: Resource.WebsocketNonceTable.name,
        Key: { wallet },
      })
    );

    if (!nonceResult.Item || nonceResult.Item.nonce !== message) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Invalid or expired nonce" }),
      };
    }

    // Verify signature
    try {
      const publicKey = new PublicKey(wallet);
      const signatureBytes = Buffer.from(signature, "base64");
      const messageBytes = new TextEncoder().encode(message);
      
      const verified = nacl.sign.detached.verify(
        messageBytes,
        signatureBytes,
        publicKey.toBytes()
      );

      if (!verified) {
        return {
          statusCode: 401,
          body: JSON.stringify({ error: "Invalid signature" }),
        };
      }
    } catch (error) {
      console.error("Signature verification error:", error);
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Invalid signature format" }),
      };
    }

    // Delete used nonce
    await client.send(
      new DeleteCommand({
        TableName: Resource.WebsocketNonceTable.name,
        Key: { wallet },
      })
    );

    // Connection successful
    console.log(`WebSocket connected: ${connectionId} for wallet: ${wallet}`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Connected" }),
    };
  } catch (error) {
    console.error("Connection error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
}; 