interface WebSocketInfo {
  socket: WebSocket;
  connectedAt: number;
  lastPing: number;
}

export class BroadcastRoom {
  private state: DurableObjectState;
  private env: any;
  private connections: Map<string, WebSocketInfo>;
  private lastActivity: number;
  
  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
    this.connections = new Map();
    this.lastActivity = Date.now();
    
    // Set up hibernation - Durable Object will sleep when idle
    this.state.setHibernatableWebSocketEventHandlers({
      message: this.handleWebSocketMessage.bind(this),
      close: this.handleWebSocketClose.bind(this),
      error: this.handleWebSocketError.bind(this),
    });
  }
  
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.lastActivity = Date.now();
    
    // Handle internal broadcast request from worker
    if (url.pathname === "/broadcast" && request.method === "POST") {
      try {
        const message = await request.json();
        await this.broadcast(message);
        return new Response(JSON.stringify({ 
          success: true, 
          connections: this.connections.size 
        }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Broadcast error:", error);
        return new Response("Broadcast failed", { status: 500 });
      }
    }
    
    // Handle WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      
      // Accept the WebSocket connection
      this.state.acceptWebSocket(server);
      
      // Generate unique connection ID
      const connectionId = crypto.randomUUID();
      
      // Store connection info
      this.connections.set(connectionId, {
        socket: server,
        connectedAt: Date.now(),
        lastPing: Date.now(),
      });
      
      // Send welcome message
      server.send(JSON.stringify({
        type: "connected",
        connectionId,
        timestamp: Date.now(),
      }));
      
      // Clean up very old connections periodically
      if (Math.random() < 0.1) { // 10% chance
        this.cleanupStaleConnections();
      }
      
      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }
    
    return new Response("Not found", { status: 404 });
  }
  
  private async handleWebSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    this.lastActivity = Date.now();
    
    // Find connection ID for this WebSocket
    let connectionId: string | null = null;
    for (const [id, info] of this.connections.entries()) {
      if (info.socket === ws) {
        connectionId = id;
        info.lastPing = Date.now();
        break;
      }
    }
    
    if (!connectionId) {
      console.error("Unknown WebSocket sent message");
      return;
    }
    
    try {
      const data = JSON.parse(message as string);
      
      // Handle ping/pong for connection health
      if (data.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
        return;
      }
      
      // Handle subscription management if needed
      if (data.type === "subscribe") {
        ws.send(JSON.stringify({ 
          type: "subscribed", 
          token: data.token,
          timestamp: Date.now(),
        }));
        return;
      }
      
    } catch (error) {
      console.error("Invalid message from client:", error);
      ws.send(JSON.stringify({ 
        type: "error", 
        message: "Invalid message format" 
      }));
    }
  }
  
  private async handleWebSocketClose(ws: WebSocket, code: number, reason: string) {
    // Find and remove the connection
    for (const [id, info] of this.connections.entries()) {
      if (info.socket === ws) {
        this.connections.delete(id);
        console.log(`WebSocket ${id} closed: ${code} ${reason}`);
        break;
      }
    }
    
    // Check if room is empty and can hibernate
    if (this.connections.size === 0) {
      console.log("No connections remaining, room can hibernate");
    }
  }
  
  private async handleWebSocketError(ws: WebSocket, error: any) {
    console.error("WebSocket error:", error);
    
    // Find and remove the errored connection
    for (const [id, info] of this.connections.entries()) {
      if (info.socket === ws) {
        this.connections.delete(id);
        console.log(`WebSocket ${id} errored and was removed`);
        break;
      }
    }
  }
  
  private async broadcast(message: any) {
    const messageStr = JSON.stringify({
      ...message,
      timestamp: Date.now(),
    });
    
    const closedConnections: string[] = [];
    
    // Send to all connected clients
    for (const [id, info] of this.connections.entries()) {
      try {
        info.socket.send(messageStr);
      } catch (error) {
        console.error(`Failed to send to ${id}:`, error);
        closedConnections.push(id);
      }
    }
    
    // Clean up closed connections
    for (const id of closedConnections) {
      this.connections.delete(id);
    }
    
    console.log(`Broadcast to ${this.connections.size} connections`);
  }
  
  private cleanupStaleConnections() {
    const now = Date.now();
    const staleTimeout = 5 * 60 * 1000; // 5 minutes
    const closedConnections: string[] = [];
    
    for (const [id, info] of this.connections.entries()) {
      if (now - info.lastPing > staleTimeout) {
        try {
          info.socket.close(1000, "Idle timeout");
        } catch (error) {
          // Socket might already be closed
        }
        closedConnections.push(id);
      }
    }
    
    for (const id of closedConnections) {
      this.connections.delete(id);
    }
    
    if (closedConnections.length > 0) {
      console.log(`Cleaned up ${closedConnections.length} stale connections`);
    }
  }
  
  // Durable Object alarm for periodic cleanup
  async alarm() {
    // Clean up stale connections every 5 minutes
    this.cleanupStaleConnections();
    
    // Schedule next alarm if we have connections
    if (this.connections.size > 0) {
      this.state.storage.setAlarm(Date.now() + 5 * 60 * 1000);
    }
  }
} 