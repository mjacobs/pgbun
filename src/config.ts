export type SSLMode = 'disable' | 'allow' | 'prefer' | 'require' | 'verify-ca' | 'verify-full';

export interface ServerConfig {
  listen_port: number;
  listen_host: string;
  server_host: string;
  server_port: number;
  pool_mode: 'session' | 'transaction' | 'statement';
  max_client_conn: number;
  default_pool_size: number;
  max_db_connections: number;
  pool_size: number;
  reserve_pool_size: number;
  reserve_pool_timeout: number;
  server_reset_query: string;
  server_check_query: string;
  server_check_delay: number;
  log_connections: boolean;
  log_disconnections: boolean;
  log_pooler_errors: boolean;
  stats_period: number;

  // TLS settings
  client_tls_mode: SSLMode;
  client_tls_key_file?: string;
  client_tls_cert_file?: string;
  client_tls_ca_file?: string;
  server_tls_mode: SSLMode;
  server_tls_key_file?: string;
  server_tls_cert_file?: string;
  server_tls_ca_file?: string;
}

export class Config {
  private config: ServerConfig;

  constructor(config: Partial<ServerConfig> = {}) {
    this.config = {
      listen_port: 6432,
      listen_host: '0.0.0.0',
      server_host: 'localhost',
      server_port: 5432,
      pool_mode: 'session',
      max_client_conn: 100,
      default_pool_size: 25,
      max_db_connections: 0,
      pool_size: 25,
      reserve_pool_size: 0,
      reserve_pool_timeout: 5000,
      server_reset_query: 'DISCARD ALL',
      server_check_query: 'SELECT 1',
      server_check_delay: 30000,
      log_connections: true,
      log_disconnections: true,
      log_pooler_errors: true,
      stats_period: 60000,
      client_tls_mode: 'disable',
      server_tls_mode: 'prefer',
      ...config
    };
  }

  static load(): Config {
    return new Config();
  }

  get listenPort(): number {
    return this.config.listen_port;
  }

  get listenHost(): string {
    return this.config.listen_host;
  }

  get serverHost(): string {
    return this.config.server_host;
  }

  get serverPort(): number {
    return this.config.server_port;
  }

  get poolMode(): 'session' | 'transaction' | 'statement' {
    return this.config.pool_mode;
  }

  get maxClientConnections(): number {
    return this.config.max_client_conn;
  }

  get defaultPoolSize(): number {
    return this.config.default_pool_size;
  }

  get logConnections(): boolean {
    return this.config.log_connections;
  }

  get logDisconnections(): boolean {
    return this.config.log_disconnections;
  }

  // TLS getters
  get clientTlsMode(): SSLMode {
    return this.config.client_tls_mode;
  }

  get clientTlsKeyFile(): string | undefined {
    return this.config.client_tls_key_file;
  }

  get clientTlsCertFile(): string | undefined {
    return this.config.client_tls_cert_file;
  }

  get clientTlsCaFile(): string | undefined {
    return this.config.client_tls_ca_file;
  }

  get serverTlsMode(): SSLMode {
    return this.config.server_tls_mode;
  }

  get serverTlsKeyFile(): string | undefined {
    return this.config.server_tls_key_file;
  }

  get serverTlsCertFile(): string | undefined {
    return this.config.server_tls_cert_file;
  }

  get serverTlsCaFile(): string | undefined {
    return this.config.server_tls_ca_file;
  }
}