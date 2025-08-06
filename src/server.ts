import { Socket, TCPSocketListener } from "bun";
import { Config } from "./config";
import { ConnectionHandler } from "./connection-handler";

export class Server {
  private server?: TCPSocketListener;
  private config: Config;
  private connectionHandler: ConnectionHandler;
  private activeConnections = new Set<Socket>();

  constructor(config: Config) {
    this.config = config;
    this.connectionHandler = new ConnectionHandler(config);
  }

  async start(): Promise<void> {
    this.server = Bun.listen({
      hostname: this.config.listenHost,
      port: this.config.listenPort,
      socket: {
        open: (socket) => this.handleConnection(socket),
        data: (socket, data) => this.handleData(socket, data),
        close: (socket) => this.handleClose(socket),
        error: (socket, error) => this.handleError(socket, error),
      },
    });

    console.log(`pgbun listening on ${this.config.listenHost}:${this.config.listenPort}`);
    console.log(`Proxying to PostgreSQL at ${this.config.serverHost}:${this.config.serverPort}`);
    console.log(`Pool mode: ${this.config.poolMode}`);
  }

  async stop(): Promise<void> {
    if (this.server) {
      this.server.stop();
      this.server = undefined;
    }

    for (const connection of this.activeConnections) {
      connection.end();
    }
    this.activeConnections.clear();

    await this.connectionHandler.shutdown();
  }

  private handleConnection(socket: Socket): void {
    this.activeConnections.add(socket);
    
    if (this.config.logConnections) {
      console.log(`New client connection from ${socket.remoteAddress}`);
    }

    this.connectionHandler.handleClient(socket);
  }

  private handleData(socket: Socket, data: Buffer): void {
    this.connectionHandler.handleClientData(socket, data);
  }

  private handleClose(socket: Socket): void {
    this.activeConnections.delete(socket);
    
    if (this.config.logDisconnections) {
      console.log(`Client disconnected: ${socket.remoteAddress}`);
    }

    this.connectionHandler.handleClientClose(socket);
  }

  private handleError(socket: Socket, error: Error): void {
    console.error(`Connection error for ${socket.remoteAddress}:`, error);
    this.connectionHandler.handleClientError(socket, error);
  }
}