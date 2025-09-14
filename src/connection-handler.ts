import { Socket } from "bun";
import { Config } from "./config";
import { ConnectionPool, ServerConnection } from "./connection-pool";
import { PostgreSQLProtocol } from "./protocol";

export class ConnectionHandler {
  private config: Config;
  private connectionPool: ConnectionPool;
  private protocol: PostgreSQLProtocol;
  private clientSessions = new Map<Socket, ClientSession>();
  private cleanupTimer?: number;

  constructor(config: Config) {
    this.config = config;
    this.connectionPool = new ConnectionPool(config);
    this.protocol = new PostgreSQLProtocol();
    
    this.startCleanupTimer();
  }

  handleClient(socket: Socket): void {
    const session = new ClientSession(socket, this.config.poolMode);
    this.clientSessions.set(socket, session);
    
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

    session.updateActivity();

    if (session.state === 'new') {
      if (this.protocol.isSSLRequest(data)) {
        this.handleSSLRequest(session);
      } else {
        const mode = this.config.clientTlsMode;
        if (mode === 'require' || mode === 'verify-ca' || mode === 'verify-full') {
          console.error("Client attempted non-TLS connection, but TLS is required.");
          const errorResponse = this.protocol.createErrorResponse('Server requires TLS');
          socket.write(errorResponse);
          socket.end();
          return;
        }
        // If not SSLRequest, proceed with regular startup
        this.processData(session, data);
      }
    } else {
      this.processData(session, data);
    }
  }

  private handleSSLRequest(session: ClientSession): void {
    const mode = this.config.clientTlsMode;
    const socket = session.socket;

    if (mode === 'disable') {
      console.log("Client requested SSL, but it's disabled. Rejecting.");
      socket.write('N');
      socket.end();
      return;
    }

    const tlsOptions: Bun.TLS.Options = {};
    if (this.config.clientTlsKeyFile && this.config.clientTlsCertFile) {
      tlsOptions.key = Bun.file(this.config.clientTlsKeyFile);
      tlsOptions.cert = Bun.file(this.config.clientTlsCertFile);
    } else {
      console.error("TLS mode is enabled, but key/cert files are not configured.");
      socket.end();
      return;
    }

    if ((mode === 'verify-ca' || mode === 'verify-full') && this.config.clientTlsCaFile) {
      tlsOptions.ca = Bun.file(this.config.clientTlsCaFile);
    } else if (mode === 'verify-ca' || mode === 'verify-full') {
      console.error("TLS verify mode enabled, but CA file is not configured.");
      socket.end();
      return;
    }

    try {
      socket.write('S');
      socket.upgradeTLS(tlsOptions);
      session.state = 'authenticating';
    } catch (e) {
      console.error("Failed to upgrade to TLS:", e);
      socket.end();
    }
  }

  private processData(session: ClientSession, data: Buffer): void {
    try {
      const messages = this.protocol.parseClientMessage(data);
      for (const message of messages) {
        this.processClientMessage(session, message);
      }
    } catch (error) {
      console.error('Error parsing client message:', error);
      session.socket.end();
    }
  }

  handleClientClose(socket: Socket): void {
    const session = this.clientSessions.get(socket);
    if (session) {
      if (session.loginTimer) {
        clearTimeout(session.loginTimer);
      }
      if (session.currentServerConnection) {
        this.connectionPool.releaseConnection(session.currentServerConnection, this.config.poolMode === 'session' ? session.sessionId : undefined);
      }
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
    session.state = 'authenticating';

    try {
      if (this.config.poolMode === 'session') {
        const serverConnection = await this.connectionPool.getConnection(
          session.sessionId,
          session.database!,
          session.user!
        );
        
        if (serverConnection) {
          session.currentServerConnection = serverConnection;
          this.setupServerToClientProxy(session, serverConnection);
        } else {
          throw new Error('No available connection for session');
        }
      }
      session.authenticated = true;
      
      if (session.loginTimer) {
        clearTimeout(session.loginTimer);
        session.loginTimer = undefined;
      }
      
      session.socket.write(this.protocol.createAuthenticationOk());
      session.socket.write(this.protocol.createReadyForQuery());
      session.state = 'active';

      console.log(`Client connected: ${session.user}@${session.database}`);
    } catch (error) {
      console.error('Failed to establish server connection:', error);
      session.socket.write(this.protocol.createErrorResponse('Failed to connect to database'));
      session.socket.end();
    }
  }

  private async handleQuery(session: ClientSession, message: any): Promise<void> {
    if (!session.currentServerConnection || !session.currentServerConnection.socket) {
      if (this.config.poolMode === 'transaction') {
        const serverConnection = await this.connectionPool.getConnection(undefined, session.database!, session.user!);
        if (serverConnection) {
          session.currentServerConnection = serverConnection;
          this.setupServerToClientProxy(session, serverConnection);
        } else {
          session.socket.write(this.protocol.createErrorResponse('No available connections'));
          return;
        }
      } else {
        session.socket.write(this.protocol.createErrorResponse('No server connection'));
        return;
      }
    }

    if (message.data.transactionType) {
      if (message.data.transactionType === 'begin' && this.config.poolMode === 'transaction') {
        session.inTransaction = true;
      }
      if ((message.data.transactionType === 'commit' || message.data.transactionType === 'rollback') && this.config.poolMode === 'transaction') {
        session.pendingRelease = true;
      }
    }

    console.log(`Proxying query: ${message.data.query}`);
    
    const queryMessage = this.protocol.createQueryMessage(message.data.query);
    session.currentServerConnection.socket.write(queryMessage);
  }

  private setupServerToClientProxy(session: ClientSession, serverConnection: ServerConnection): void {
    if (!serverConnection.socket) return;

    (serverConnection.socket as any).data = (socket: any, data: Buffer) => {
      try {
        const msgs = this.protocol.parseServerMessage(data);
        const hasReadyForQuery = msgs.some(m => m.type === 'ReadyForQuery');
        if (hasReadyForQuery && this.config.poolMode === 'transaction') {
          if (session.pendingRelease || !session.inTransaction) {
            this.connectionPool.releaseConnection(session.currentServerConnection, undefined);
            session.currentServerConnection = undefined;
          }
          if (session.pendingRelease) {
            session.pendingRelease = false;
            session.inTransaction = false;
          }
        }
        session.socket.write(data);
      } catch (error) {
        console.error('Error proxying server data to client:', error);
        session.socket.end();
      }
    };

    (serverConnection.socket as any).close = () => {
      console.log(`Server connection closed for ${session.user}@${session.database}`);
      session.socket.end();
    };

    (serverConnection.socket as any).error = (socket: any, error: Error) => {
      console.error('Server connection error:', error);
      session.socket.write(this.protocol.createErrorResponse('Server connection error'));
      session.socket.end();
    };
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupIdleConnections();
    }, 30000);
  }

  private cleanupIdleConnections(): void {
    const serverCleaned = this.connectionPool.cleanupIdleConnections();
    if (serverCleaned > 0) {
      console.log(`Cleaned up ${serverCleaned} idle server connections`);
    }

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
  currentServerConnection?: ServerConnection;
  state: 'new' | 'authenticating' | 'active' = 'new';

  connectedAt: Date;
  lastActivity: Date;
  authenticated: boolean = false;
  loginTimer?: number;
  pendingRelease: boolean = false;

  sessionId: string;
  poolMode: 'session' | 'transaction' | 'statement';
  inTransaction: boolean = false;

  constructor(socket: Socket, poolMode: 'session' | 'transaction' | 'statement') {
    this.socket = socket;
    this.connectedAt = new Date();
    this.lastActivity = new Date();
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.poolMode = poolMode;
  }

  updateActivity(): void {
    this.lastActivity = new Date();
  }

  getIdleTime(): number {
    return new Date().getTime() - this.lastActivity.getTime();
  }
}