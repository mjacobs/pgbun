import { Config } from "./config";

export interface ServerConnection {
  id: string;
  socket?: any;
  database: string;
  user: string;
  inUse: boolean;
  createdAt: Date;
  lastUsed: Date;
}

export class ConnectionPool {
  private config: Config;
  private pools = new Map<string, ServerConnection[]>();
  private totalConnections = 0;

  constructor(config: Config) {
    this.config = config;
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

    const connection: ServerConnection = {
      id: connectionId,
      database,
      user,
      inUse: false,
      createdAt: new Date(),
      lastUsed: new Date(),
    };

    return connection;
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