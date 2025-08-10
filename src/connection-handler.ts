import { Socket } from "bun";
import { Config } from "./config";
import { ConnectionPool } from "./connection-pool";
import { PostgreSQLProtocol } from "./protocol";

export class ConnectionHandler {
  private config: Config;
  private connectionPool: ConnectionPool;
  private protocol: PostgreSQLProtocol;
  private clientSessions = new Map<Socket, ClientSession>();
  private cleanupTimer?: Timer;

  constructor(config: Config) {
    this.config = config;
    this.connectionPool = new ConnectionPool(config);
    this.protocol = new PostgreSQLProtocol();
    
    // Start periodic cleanup for idle connections
    this.startCleanupTimer();
  }

  handleClient(socket: Socket): void {
    const session = new ClientSession(socket);
    this.clientSessions.set(socket, session);
    
    // Set client login timeout if configured
    if (this.config.clientLoginTimeout > 0) {
      session.loginTimer = setTimeout(() => {
        if (!session.authenticated) {
          console.log(`Client login timeout after ${this.config.clientLoginTimeout}ms`);
          socket.write(this.protocol.createErrorResponse('Login timeout'));
          socket.end();
        }
      }, this.config.clientLoginTimeout);
    }
  }

  handleClientData(socket: Socket, data: Buffer): void {
    const session = this.clientSessions.get(socket);
    if (!session) return;

    // Update activity timestamp
    session.updateActivity();

    try {
      const messages = this.protocol.parseClientMessage(data);
      for (const message of messages) {
        this.processClientMessage(session, message);
      }
    } catch (error) {
      console.error('Error parsing client message:', error);
      socket.end();
    }
  }

  handleClientClose(socket: Socket): void {
    const session = this.clientSessions.get(socket);
    if (session) {
      if (session.loginTimer) {
        clearTimeout(session.loginTimer);
      }
      this.connectionPool.releaseConnection(session.serverConnection);
      this.clientSessions.delete(socket);
    }
  }

  handleClientError(socket: Socket, error: Error): void {
    console.error('Client error:', error);
    this.handleClientClose(socket);
  }

  async shutdown(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    await this.connectionPool.shutdown();
  }

  private async processClientMessage(session: ClientSession, message: any): Promise<void> {
    switch (message.type) {
      case 'startup':
        await this.handleStartup(session, message);
        break;
      case 'query':
        await this.handleQuery(session, message);
        break;
      case 'terminate':
        session.socket.end();
        break;
      default:
        console.warn('Unhandled message type:', message.type);
    }
  }

  private async handleStartup(session: ClientSession, message: any): Promise<void> {
    session.database = message.data.database || 'postgres';
    session.user = message.data.user || 'postgres';
    
    try {
      const serverConnection = await this.connectionPool.getConnection(
        session.database!,
        session.user!
      );
      
      if (serverConnection) {
        session.serverConnection = serverConnection;
        session.authenticated = true;
        
        // Clear login timeout since authentication succeeded
        if (session.loginTimer) {
          clearTimeout(session.loginTimer);
          session.loginTimer = undefined;
        }
        
        // Set up bidirectional proxying
        this.setupServerToClientProxy(session, serverConnection);
        
        // Send authentication success to client
        session.socket.write(this.protocol.createAuthenticationOk());
        session.socket.write(this.protocol.createReadyForQuery());
        
        console.log(`Client connected: ${session.user}@${session.database}`);
      } else {
        session.socket.write(this.protocol.createErrorResponse('Connection pool exhausted'));
        session.socket.end();
      }
    } catch (error) {
      console.error('Failed to establish server connection:', error);
      session.socket.write(this.protocol.createErrorResponse('Failed to connect to database'));
      session.socket.end();
    }
  }

  private async handleQuery(session: ClientSession, message: any): Promise<void> {
    if (!session.serverConnection || !session.serverConnection.socket) {
      session.socket.write(this.protocol.createErrorResponse('No server connection'));
      return;
    }

    console.log(`Proxying query: ${message.data.query}`);
    
    // Create query message and send to PostgreSQL server
    const queryMessage = this.protocol.createQueryMessage(message.data.query);
    session.serverConnection.socket.write(queryMessage);
  }

  private setupServerToClientProxy(session: ClientSession, serverConnection: any): void {
    if (!serverConnection.socket) return;

    // Set up server data handler to proxy responses back to client
    (serverConnection.socket as any).data = (socket: any, data: Buffer) => {
      try {
        // For now, just proxy raw data back to client
        // In a more sophisticated implementation, we might parse and modify messages
        session.socket.write(data);
      } catch (error) {
        console.error('Error proxying server data to client:', error);
        session.socket.end();
      }
    };

    // Handle server connection close
    (serverConnection.socket as any).close = () => {
      console.log(`Server connection closed for ${session.user}@${session.database}`);
      session.socket.end();
    };

    // Handle server connection errors
    (serverConnection.socket as any).error = (socket: any, error: Error) => {
      console.error('Server connection error:', error);
      session.socket.write(this.protocol.createErrorResponse('Server connection error'));
      session.socket.end();
    };
  }

  private startCleanupTimer(): void {
    // Run cleanup every 30 seconds
    this.cleanupTimer = setInterval(() => {
      this.cleanupIdleConnections();
    }, 30000);
  }

  private cleanupIdleConnections(): void {
    // Clean up idle server connections
    const serverCleaned = this.connectionPool.cleanupIdleConnections();
    if (serverCleaned > 0) {
      console.log(`Cleaned up ${serverCleaned} idle server connections`);
    }

    // Clean up idle client connections
    if (this.config.clientIdleTimeout > 0) {
      const clientCleaned = this.cleanupIdleClients();
      if (clientCleaned > 0) {
        console.log(`Cleaned up ${clientCleaned} idle client connections`);
      }
    }
  }

  private cleanupIdleClients(): number {
    let cleaned = 0;
    const maxIdleTime = this.config.clientIdleTimeout;

    for (const [socket, session] of this.clientSessions.entries()) {
      const idleTime = session.getIdleTime();
      
      if (idleTime > maxIdleTime) {
        console.log(`Closing idle client connection (idle for ${Math.floor(idleTime / 1000)}s)`);
        socket.end();
        cleaned++;
      }
    }

    return cleaned;
  }
}

class ClientSession {
  socket: Socket;
  database?: string;
  user?: string;
  serverConnection?: any;
  connectedAt: Date;
  lastActivity: Date;
  authenticated: boolean = false;
  loginTimer?: Timer;

  constructor(socket: Socket) {
    this.socket = socket;
    this.connectedAt = new Date();
    this.lastActivity = new Date();
  }

  updateActivity(): void {
    this.lastActivity = new Date();
  }

  getIdleTime(): number {
    return new Date().getTime() - this.lastActivity.getTime();
  }
}