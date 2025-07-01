export interface Env {
  BROADCAST_ROOM: DurableObjectNamespace;
  WEBHOOK_SECRET: string;
  ALLOWED_ORIGINS: string;
}

// Main worker - handles routing
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // Route: POST /broadcast/:token - REST endpoint for Lambda webhooks
    if (url.pathname.startsWith("/broadcast/") && request.method === "POST") {
      const token = url.pathname.split("/")[2];
      if (!token) {
        return new Response("Token required", { status: 400 });
      }
      
      // Verify webhook secret
      const authHeader = request.headers.get("Authorization");
      if (authHeader !== `Bearer ${env.WEBHOOK_SECRET}`) {
        return new Response("Unauthorized", { status: 401 });
      }
      
      try {
        const message = await request.json();
        
        // Get or create Durable Object for this token
        const roomId = env.BROADCAST_ROOM.idFromName(token);
        const room = env.BROADCAST_ROOM.get(roomId);
        
        // Forward message to Durable Object
        const response = await room.fetch(new Request("http://internal/broadcast", {
          method: "POST",
          body: JSON.stringify(message),
          headers: { "Content-Type": "application/json" },
        }));
        
        return response;
      } catch (error) {
        console.error("Broadcast error:", error);
        return new Response("Internal error", { status: 500 });
      }
    }
    
    // Route: /ws/:token - WebSocket endpoint for clients
    if (url.pathname.startsWith("/ws/")) {
      const token = url.pathname.split("/")[2];
      if (!token) {
        return new Response("Token required", { status: 400 });
      }
      
      // Check WebSocket upgrade header
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }
      
      // CORS check for WebSocket
      const origin = request.headers.get("Origin");
      if (origin) {
        const allowedOrigins = env.ALLOWED_ORIGINS.split(",");
        if (!allowedOrigins.includes(origin)) {
          return new Response("Origin not allowed", { status: 403 });
        }
      }
      
      // Get or create Durable Object for this token
      const roomId = env.BROADCAST_ROOM.idFromName(token);
      const room = env.BROADCAST_ROOM.get(roomId);
      
      // Forward WebSocket request to Durable Object
      return room.fetch(request);
    }
    
    // Health check endpoint
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ 
        status: "healthy",
        timestamp: new Date().toISOString(),
      }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    
    return new Response("Not found", { status: 404 });
  },
};

// Export the Durable Object class
export { BroadcastRoom } from "./durable-objects/BroadcastRoom"; 