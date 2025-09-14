import { Socket } from "bun";
import { Config, SSLMode } from "./config";
import { PostgreSQLProtocol } from "./protocol";

export interface ServerConnection {
  id: string;
  socket?: Socket;
  database: string;
  user: string;
  inUse: boolean;
  createdAt: Date;
  lastUsed: Date;
  authenticated: boolean;
}

export class ConnectionPool {
  private config: Config;
  private pools = new Map<string, ServerConnection[]>();
  private sessionTrackedConnections = new Map<string, ServerConnection>();
  private totalConnections = 0;
  private protocol: PostgreSQLProtocol;

  constructor(config: Config) {
    this.config = config;
    this.protocol = new PostgreSQLProtocol();
  }

  private getPoolKey(database: string, user: string): string {
    return `${database}:${user}`;
  }

  async getConnection(sessionId: string | undefined, database: string, user: string): Promise<ServerConnection | undefined> {
    const poolKey = this.getPoolKey(database, user);
    let pool = this.pools.get(poolKey);
    
    let connection: ServerConnection | undefined;
    
    if (this.config.poolMode === 'session' && sessionId) {
      const sessionKey = `${sessionId}:${poolKey}`;
      const tracked = this.sessionTrackedConnections.get(sessionKey);
      if (tracked && !tracked.inUse) {
        tracked.inUse = true;
        tracked.lastUsed = new Date();
        console.log(`Reusing session-tracked connection ${tracked.id} for session ${sessionId}`);
        return tracked;
      }
    }

    if (!pool) {
      pool = [];
      this.pools.set(poolKey, pool);
    }

    let connection = pool.find(conn => !conn.inUse);

    if (!connection && this.totalConnections < this.config.maxClientConnections) {
      connection = await this.createConnection(database, user);
      if (connection) {
        pool.push(connection);
        this.totalConnections++;
        
        if (this.config.poolMode === 'session' && sessionId) {
          const sessionKey = `${sessionId}:${poolKey}`;
          this.sessionTrackedConnections.set(sessionKey, connection);
        }
      }
    }

    if (connection) {
      connection.inUse = true;
      connection.lastUsed = new Date();
      console.log(`Assigned connection ${connection.id} to ${user}@${database}`);
    }

    return connection;
  }

  releaseConnection(connection?: ServerConnection, sessionId?: string): void {
    if (!connection) return;

    connection.inUse = false;
    connection.lastUsed = new Date();
    
    console.log(`Released connection ${connection.id}`);
    
    if (this.config.poolMode === 'session' && sessionId && connection.database && connection.user) {
      const poolKey = this.getPoolKey(connection.database, connection.user);
      const sessionKey = `${sessionId}:${poolKey}`;
      if (this.sessionTrackedConnections.get(sessionKey) === connection) {
        this.sessionTrackedConnections.delete(sessionKey);
        console.log(`Removed session-tracked connection ${connection.id} for session ${sessionId}`);
      }
    }
  }

  private async createConnection(database: string, user: string): Promise<ServerConnection | undefined> {
    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`Creating new connection ${connectionId} for ${user}@${database}`);

    try {
      const connectPromise = this.connectWithSSL(this.config.serverTlsMode);

      const socket = await Promise.race([
        connectPromise,
        new Promise<Socket | never>((_, reject) => {
          setTimeout(() => reject(new Error(`Connection timeout after ${this.config.serverConnectTimeout}ms`)), 
                     this.config.serverConnectTimeout);
        })
      ]);

      if (!socket) {
        throw new Error("Failed to establish socket connection.");
      }

      const connection: ServerConnection = {
        id: connectionId,
        socket,
        database,
        user,
        inUse: false,
        createdAt: new Date(),
        lastUsed: new Date(),
        authenticated: false,
      };

      await this.authenticateServerConnection(connection);

      return connection;
    } catch (error) {
      console.error(`Failed to create connection ${connectionId}:`, error);
      return undefined;
    }
  }

  private async connectWithSSL(mode: SSLMode): Promise<Socket | null> {
    const hostDetails = {
      hostname: this.config.serverHost,
      port: this.config.serverPort,
    };

    const emptyHandlers = {
      data: () => {},
      open: () => {},
      close: () => {},
      error: () => {},
    };

    if (mode === 'disable') {
      console.log('Connecting to server with SSL disabled.');
      return Bun.connect({ ...hostDetails, socket: emptyHandlers });
    }

    const socket = await Bun.connect({ ...hostDetails, socket: emptyHandlers });

    return new Promise((resolve, reject) => {
      socket.data = (sock: Socket, data: Buffer) => {
        sock.data = emptyHandlers.data;

        if (data.toString() === 'S') {
          console.log("Server accepted SSL request. Upgrading connection...");
          const tlsOptions: Bun.TLS.Options = {};
          if (this.config.serverTlsCaFile) {
            tlsOptions.ca = Bun.file(this.config.serverTlsCaFile);
          }
          if (this.config.serverTlsKeyFile) {
            tlsOptions.key = Bun.file(this.config.serverTlsKeyFile);
          }
          if (this.config.serverTlsCertFile) {
            tlsOptions.cert = Bun.file(this.config.serverTlsCertFile);
          }

          if (mode === 'verify-full') {
            tlsOptions.serverName = this.config.serverHost;
          }
          try {
            sock.upgradeTLS(tlsOptions);
            resolve(sock);
          } catch (e) {
            reject(e);
          }
        } else if (data.toString() === 'N') {
          if (mode === 'prefer' || mode === 'allow') {
            console.log("Server refused SSL, proceeding with non-TLS connection.");
            resolve(sock);
          } else {
            reject(new Error(`Server refused SSL connection, but mode is '${mode}'`));
          }
        } else {
          reject(new Error('Invalid response to SSLRequest'));
        }
      };

      const sslRequest = this.protocol.createSSLRequestMessage();
      socket.write(sslRequest);
    });
  }

  private async authenticateServerConnection(connection: ServerConnection): Promise<void> {
    if (!connection.socket) {
      throw new Error('No socket for server connection');
    }

    return new Promise((resolve, reject) => {
      let authenticated = false;
      const authTimeout = setTimeout(() => {
        if (!authenticated) {
          reject(new Error(`Authentication timeout after ${this.config.serverConnectTimeout}ms`));
        }
      }, this.config.serverConnectTimeout);

      (connection.socket as any).data = (socket: Socket, data: Buffer) => {
        try {
          console.log(`Received server data during auth for ${connection.id}: ${data.length} bytes`);
          const messages = this.protocol.parseServerMessage(data);
          console.log(`Parsed ${messages.length} messages:`, messages.map(m => m.type));
          for (const message of messages) {
            if (message.type === 'AuthenticationOk') {
              authenticated = true;
              connection.authenticated = true;
              clearTimeout(authTimeout);
              
              (connection.socket as any).data = () => {};
              (connection.socket as any).close = () => {
                console.log(`Server connection ${connection.id} closed`);
              };
              (connection.socket as any).error = (socket: Socket, error: Error) => {
                console.error(`Server connection ${connection.id} error:`, error);
              };
              
              resolve();
            } else if (message.type === 'ErrorResponse') {
              clearTimeout(authTimeout);
              reject(new Error(`Authentication failed: ${message.data?.message || 'Unknown error'}`));
            } else if (message.type === 'ReadyForQuery') {
              // Ignore
            }
          }
        } catch (error) {
          clearTimeout(authTimeout);
          reject(error);
        }
      };

      const startupMessage = this.protocol.createStartupMessage({
        user: connection.user,
        database: connection.database
      });
      
      console.log(`Sending startup message to server for ${connection.user}@${connection.database}`);
      connection.socket!.write(startupMessage);
    });
  }

  async shutdown(): Promise<void> {
    console.log('Shutting down connection pools...');
    
    for (const pool of this.pools.values()) {
      for (const connection of pool) {
        if (connection.socket) {
          connection.socket.end();
        }
      }
    }
    
    this.pools.clear();
    this.totalConnections = 0;
  }

  getStats() {
    const stats = {
      totalConnections: this.totalConnections,
      pools: Array.from(this.pools.entries()).map(([key, pool]) => ({
        key,
        total: pool.length,
        inUse: pool.filter(c => c.inUse).length,
        idle: pool.filter(c => !c.inUse).length
      }))
    };
    return stats;
  }

  cleanupIdleConnections(): number {
    if (this.config.serverIdleTimeout <= 0) {
      return 0;
    }

    let cleaned = 0;
    const now = new Date();
    const maxIdleTime = this.config.serverIdleTimeout;

    for (const [poolKey, pool] of this.pools.entries()) {
      for (let i = pool.length - 1; i >= 0; i--) {
        const connection = pool[i];
        
        if (!connection.inUse) {
          const idleTime = now.getTime() - connection.lastUsed.getTime();
          
          if (idleTime > maxIdleTime) {
            console.log(`Closing idle server connection ${connection.id} (idle for ${Math.floor(idleTime / 1000)}s)`);
            
            if (connection.socket) {
              connection.socket.end();
            }
            
            pool.splice(i, 1);
            this.totalConnections--;
            cleaned++;
          }
        }
      }
    }

    return cleaned;
  }
}