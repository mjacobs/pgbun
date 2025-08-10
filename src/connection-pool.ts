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
  private totalConnections = 0;
  private protocol: PostgreSQLProtocol;

  constructor(config: Config) {
    this.config = config;
    this.protocol = new PostgreSQLProtocol();
  }

  private getPoolKey(database: string, user: string): string {
    return `${database}:${user}`;
  }

  async getConnection(database: string, user: string): Promise<ServerConnection | null> {
    const poolKey = this.getPoolKey(database, user);
    let pool = this.pools.get(poolKey);

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
      }
    }

    if (connection) {
      connection.inUse = true;
      connection.lastUsed = new Date();
      console.log(`Assigned connection ${connection.id} to ${user}@${database}`);
    }

    return connection;
  }

  releaseConnection(connection?: ServerConnection): void {
    if (!connection) return;

    connection.inUse = false;
    connection.lastUsed = new Date();
    
    console.log(`Released connection ${connection.id}`);
  }

  private async createConnection(database: string, user: string): Promise<ServerConnection | null> {
    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`Creating new connection ${connectionId} for ${user}@${database}`);

    try {
      const socket = await this.connectWithSSL(this.config.serverTlsMode);

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

      // Authenticate with PostgreSQL server
      await this.authenticateServerConnection(connection);

      return connection;
    } catch (error) {
      console.error(`Failed to create connection ${connectionId}:`, error);
      return null;
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
      const timeout = setTimeout(() => {
        socket.end();
        reject(new Error('SSLRequest timeout'));
      }, 5000);

      socket.data = (sock: Socket, data: Buffer) => {
        clearTimeout(timeout);
        // Clean up the temporary handler
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
          reject(new Error('Authentication timeout'));
        }
      }, 5000);

      // Handle server messages during authentication
      connection.socket.data = (socket: Socket, data: Buffer) => {
        try {
          console.log(`Received server data during auth for ${connection.id}: ${data.length} bytes`);
          const messages = this.protocol.parseServerMessage(data);
          console.log(`Parsed ${messages.length} messages:`, messages.map(m => m.type));
          for (const message of messages) {
            if (message.type === 'AuthenticationOk') {
              authenticated = true;
              connection.authenticated = true;
              clearTimeout(authTimeout);
              
              // Reset socket handlers for normal operation
              connection.socket.data = () => {}; // Will be overridden when connection is used
              connection.socket.close = () => {
                console.log(`Server connection ${connection.id} closed`);
              };
              connection.socket.error = (socket: Socket, error: Error) => {
                console.error(`Server connection ${connection.id} error:`, error);
              };
              
              resolve();
            } else if (message.type === 'ErrorResponse') {
              clearTimeout(authTimeout);
              reject(new Error(`Authentication failed: ${message.data?.message || 'Unknown error'}`));
            } else if (message.type === 'ReadyForQuery') {
              // Ignore ReadyForQuery during auth - we'll handle this in normal operation
            }
          }
        } catch (error) {
          clearTimeout(authTimeout);
          reject(error);
        }
      };

      // Send startup message to PostgreSQL server
      const startupMessage = this.protocol.createStartupMessage({
        user: connection.user,
        database: connection.database
      });
      
      console.log(`Sending startup message to server for ${connection.user}@${connection.database}`);
      connection.socket.write(startupMessage);
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
}