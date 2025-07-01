import { Handler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import { Connection, PublicKey } from "@solana/web3.js";

const dynamoClient = new DynamoDBClient({});
const connection = new Connection(process.env.RPC_URL || "https://api.mainnet-beta.solana.com");

interface TokenBalance {
  wallet: string;
  token: string;
  balance: number;
}

export const handler: Handler = async () => {
  try {
    console.log("Starting balance snapshot job");
    
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Get all active users (in production, this would be more sophisticated)
    const usersResult = await dynamoClient.send(
      new QueryCommand({
        TableName: Resource.UsersTable.name,
        // In production, you'd have a GSI for active users
        Limit: 100, // Process in batches
      })
    );
    
    const users = usersResult.Items || [];
    
    // Get current token prices for value calculation
    const tokenPrices = new Map<string, number>();
    const tokens = ["DROP", "MEME", "DOGE"]; // Example tokens
    
    for (const token of tokens) {
      // Get latest price
      const today = new Date();
      const dateStr = today.toISOString().split("T")[0].replace(/-/g, "");
      
      const priceResult = await dynamoClient.send(
        new QueryCommand({
          TableName: Resource.PriceTimeSeriesTable.name,
          KeyConditionExpression: "tokenDate = :tokenDate",
          ExpressionAttributeValues: {
            ":tokenDate": `${token}#${dateStr}`,
          },
          ScanIndexForward: false,
          Limit: 1,
        })
      );
      
      if (priceResult.Items && priceResult.Items.length > 0) {
        tokenPrices.set(token, priceResult.Items[0].price);
      }
    }
    
    // Process each user
    for (const user of users) {
      const wallet = user.wallet;
      
      try {
        const walletPubkey = new PublicKey(wallet);
        
        // For each token, get balance and create snapshot
        for (const token of tokens) {
          const tokenPubkey = new PublicKey(token);
          
          // Get token balance (simplified - in production use getTokenAccountsByOwner)
          const balance = 1000; // Placeholder - would query actual balance
          
          const price = tokenPrices.get(token) || 0;
          const valueUsd = balance * price;
          
          // Write balance snapshot
          await dynamoClient.send(
            new PutCommand({
              TableName: Resource.BalanceSnapshotsTable.name,
              Item: {
                walletToken: `${wallet}#${token}`,
                timestamp,
                balance,
                price,
                valueUsd,
              },
            })
          );
          
          console.log(`Snapshot created for ${wallet} - ${token}: ${balance} @ ${price}`);
        }
      } catch (error) {
        console.error(`Error processing wallet ${wallet}:`, error);
      }
    }
    
    console.log("Balance snapshot job completed");
    
  } catch (error) {
    console.error("Error in snapshot balances job:", error);
    throw error;
  }
}; 