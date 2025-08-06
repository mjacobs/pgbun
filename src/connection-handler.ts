import { Socket } from "bun";
import { Config } from "./config";
import { ConnectionPool } from "./connection-pool";
import { PostgreSQLProtocol } from "./protocol";

export class ConnectionHandler {
  private config: Config;
  private connectionPool: ConnectionPool;
  private protocol: PostgreSQLProtocol;
  private clientSessions = new Map<Socket, ClientSession>();

  constructor(config: Config) {
    this.config = config;
    this.connectionPool = new ConnectionPool(config);
    this.protocol = new PostgreSQLProtocol();
  }

  handleClient(socket: Socket): void {
    const session = new ClientSession(socket);
    this.clientSessions.set(socket, session);
  }

  handleClientData(socket: Socket, data: Buffer): void {
    const session = this.clientSessions.get(socket);
    if (!session) return;

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
      this.connectionPool.releaseConnection(session.serverConnection);
      this.clientSessions.delete(socket);
    }
  }

  handleClientError(socket: Socket, error: Error): void {
    console.error('Client error:', error);
    this.handleClientClose(socket);
  }

  async shutdown(): Promise<void> {
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
    session.database = message.database || 'postgres';
    session.user = message.user || 'postgres';
    
    const serverConnection = await this.connectionPool.getConnection(
      session.database,
      session.user
    );
    
    if (serverConnection) {
      session.serverConnection = serverConnection;
      session.socket.write(this.protocol.createAuthenticationOk());
      session.socket.write(this.protocol.createReadyForQuery());
    } else {
      session.socket.write(this.protocol.createErrorResponse('Connection pool exhausted'));
      session.socket.end();
    }
  }

  private async handleQuery(session: ClientSession, message: any): Promise<void> {
    if (!session.serverConnection) {
      session.socket.write(this.protocol.createErrorResponse('No server connection'));
      return;
    }

    console.log(`Proxying query: ${message.query}`);
    session.socket.write(this.protocol.createCommandComplete('SELECT 1'));
    session.socket.write(this.protocol.createReadyForQuery());
  }
}

class ClientSession {
  socket: Socket;
  database?: string;
  user?: string;
  serverConnection?: any;

  constructor(socket: Socket) {
    this.socket = socket;
  }
}