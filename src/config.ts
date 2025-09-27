import { CLIOptions } from "./cli";
import * as TOML from "@iarna/toml";
import * as fs from "fs";

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
  
  // Connection timeout settings (in milliseconds)
  server_connect_timeout: number;
  client_login_timeout: number;
  server_idle_timeout: number;
  client_idle_timeout: number;

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

      // Connection timeouts (defaults match pgbouncer)
      server_connect_timeout: 15000,  // 15 seconds
      client_login_timeout: 60000,    // 60 seconds
      server_idle_timeout: 600000,    // 10 minutes
      client_idle_timeout: 0,         // 0 = disabled

      // TLS settings
      client_tls_mode: 'disable',
      server_tls_mode: 'prefer',
      ...config
    };

    // Validate configuration
    this.validate();
  }

  private validate(): void {
    // Validate pool_mode
    const validModes = ['session', 'transaction', 'statement'] as const;
    if (!validModes.includes(this.config.pool_mode)) {
      throw new Error(`Invalid pool_mode: '${this.config.pool_mode}'. Must be one of: ${validModes.join(', ')}`);
    }

    // Validate port ranges
    if (this.config.listen_port < 1 || this.config.listen_port > 65535) {
      throw new Error(`Invalid listen_port: ${this.config.listen_port}. Must be between 1 and 65535`);
    }

    if (this.config.server_port < 1 || this.config.server_port > 65535) {
      throw new Error(`Invalid server_port: ${this.config.server_port}. Must be between 1 and 65535`);
    }

    // Validate connection limits
    if (this.config.max_client_conn < 1) {
      throw new Error(`Invalid max_client_conn: ${this.config.max_client_conn}. Must be at least 1`);
    }

    if (this.config.pool_size < 1) {
      throw new Error(`Invalid pool_size: ${this.config.pool_size}. Must be at least 1`);
    }

    if (this.config.default_pool_size < 1) {
      throw new Error(`Invalid default_pool_size: ${this.config.default_pool_size}. Must be at least 1`);
    }

    // Validate timeout values
    if (this.config.server_connect_timeout < 1000) {
      throw new Error(`Invalid server_connect_timeout: ${this.config.server_connect_timeout}. Must be at least 1000ms`);
    }

    if (this.config.client_login_timeout < 1000) {
      throw new Error(`Invalid client_login_timeout: ${this.config.client_login_timeout}. Must be at least 1000ms`);
    }

    if (this.config.stats_period < 1000) {
      throw new Error(`Invalid stats_period: ${this.config.stats_period}. Must be at least 1000ms`);
    }

    // Validate TLS modes
    const validSSLModes: SSLMode[] = ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'];
    if (!validSSLModes.includes(this.config.client_tls_mode)) {
      throw new Error(`Invalid client_tls_mode: '${this.config.client_tls_mode}'. Must be one of: ${validSSLModes.join(', ')}`);
    }

    if (!validSSLModes.includes(this.config.server_tls_mode)) {
      throw new Error(`Invalid server_tls_mode: '${this.config.server_tls_mode}'. Must be one of: ${validSSLModes.join(', ')}`);
    }

    // Validate host strings
    if (!this.config.listen_host.trim()) {
      throw new Error('listen_host cannot be empty');
    }

    if (!this.config.server_host.trim()) {
      throw new Error('server_host cannot be empty');
    }
  }

  static load(cliOptions: CLIOptions = {}): Config {
    // Load environment variables
    const envConfig = this.loadFromEnvironment();
    
    // Load config file if specified
    let fileConfig = {};
    if (cliOptions.config) {
      fileConfig = this.loadFromFile(cliOptions.config);
    }
    
    // Merge configurations: CLI > env > file > defaults
    const mergedConfig = {
      ...envConfig,
      ...fileConfig,
      ...this.mapCLIToConfig(cliOptions)
    };
    
    return new Config(mergedConfig);
  }

  static loadFromEnvironment(): Partial<ServerConfig> {
    const config: Partial<ServerConfig> = {};
    
    if (process.env.PGBUN_LISTEN_PORT) {
      const port = parseInt(process.env.PGBUN_LISTEN_PORT);
      if (!isNaN(port)) config.listen_port = port;
    }
    
    if (process.env.PGBUN_LISTEN_HOST) {
      config.listen_host = process.env.PGBUN_LISTEN_HOST;
    }
    
    if (process.env.PGBUN_SERVER_HOST) {
      config.server_host = process.env.PGBUN_SERVER_HOST;
    }
    
    if (process.env.PGBUN_SERVER_PORT) {
      const port = parseInt(process.env.PGBUN_SERVER_PORT);
      if (!isNaN(port)) config.server_port = port;
    }
    
    if (process.env.PGBUN_POOL_MODE) {
      const mode = process.env.PGBUN_POOL_MODE;
      if (['session', 'transaction', 'statement'].includes(mode)) {
        config.pool_mode = mode as 'session' | 'transaction' | 'statement';
      }
    }
    
    if (process.env.PGBUN_MAX_CLIENT_CONN) {
      const num = parseInt(process.env.PGBUN_MAX_CLIENT_CONN);
      if (!isNaN(num)) config.max_client_conn = num;
    }
    
    if (process.env.PGBUN_POOL_SIZE) {
      const num = parseInt(process.env.PGBUN_POOL_SIZE);
      if (!isNaN(num)) config.pool_size = num;
    }
    
    if (process.env.PGBUN_LOG_CONNECTIONS) {
      config.log_connections = process.env.PGBUN_LOG_CONNECTIONS === 'true';
    }
    
    if (process.env.PGBUN_STATS_PERIOD) {
      const num = parseInt(process.env.PGBUN_STATS_PERIOD);
      if (!isNaN(num)) config.stats_period = num;
    }
    
    return config;
  }

  static loadFromFile(configPath: string): Partial<ServerConfig> {
    try {
      if (!fs.existsSync(configPath)) {
        throw new Error(`Configuration file not found: ${configPath}`);
      }
      
      const content = fs.readFileSync(configPath, 'utf-8');
      const parsed = TOML.parse(content) as any;
      
      const config: Partial<ServerConfig> = {};
      
      // Map TOML structure to ServerConfig
      if (parsed.server) {
        if (parsed.server.listen_port !== undefined) config.listen_port = parsed.server.listen_port;
        if (parsed.server.listen_host !== undefined) config.listen_host = parsed.server.listen_host;
        if (parsed.server.server_host !== undefined) config.server_host = parsed.server.server_host;
        if (parsed.server.server_port !== undefined) config.server_port = parsed.server.server_port;
      }
      
      if (parsed.pool) {
        if (parsed.pool.pool_mode !== undefined) config.pool_mode = parsed.pool.pool_mode;
        if (parsed.pool.max_client_conn !== undefined) config.max_client_conn = parsed.pool.max_client_conn;
        if (parsed.pool.pool_size !== undefined) config.pool_size = parsed.pool.pool_size;
        if (parsed.pool.reserve_pool_size !== undefined) config.reserve_pool_size = parsed.pool.reserve_pool_size;
        if (parsed.pool.reserve_pool_timeout !== undefined) config.reserve_pool_timeout = parsed.pool.reserve_pool_timeout;
      }
      
      if (parsed.logging) {
        if (parsed.logging.log_connections !== undefined) config.log_connections = parsed.logging.log_connections;
        if (parsed.logging.log_disconnections !== undefined) config.log_disconnections = parsed.logging.log_disconnections;
        if (parsed.logging.log_pooler_errors !== undefined) config.log_pooler_errors = parsed.logging.log_pooler_errors;
        if (parsed.logging.stats_period !== undefined) config.stats_period = parsed.logging.stats_period;
      }
      
      if (parsed.timeouts) {
        if (parsed.timeouts.server_connect_timeout !== undefined) config.server_connect_timeout = parsed.timeouts.server_connect_timeout;
        if (parsed.timeouts.client_login_timeout !== undefined) config.client_login_timeout = parsed.timeouts.client_login_timeout;
        if (parsed.timeouts.server_idle_timeout !== undefined) config.server_idle_timeout = parsed.timeouts.server_idle_timeout;
        if (parsed.timeouts.client_idle_timeout !== undefined) config.client_idle_timeout = parsed.timeouts.client_idle_timeout;
      }
      
      if (parsed.tls) {
        if (parsed.tls.client_tls_mode !== undefined) config.client_tls_mode = parsed.tls.client_tls_mode;
        if (parsed.tls.client_tls_key_file !== undefined) config.client_tls_key_file = parsed.tls.client_tls_key_file;
        if (parsed.tls.client_tls_cert_file !== undefined) config.client_tls_cert_file = parsed.tls.client_tls_cert_file;
        if (parsed.tls.client_tls_ca_file !== undefined) config.client_tls_ca_file = parsed.tls.client_tls_ca_file;
        if (parsed.tls.server_tls_mode !== undefined) config.server_tls_mode = parsed.tls.server_tls_mode;
        if (parsed.tls.server_tls_key_file !== undefined) config.server_tls_key_file = parsed.tls.server_tls_key_file;
        if (parsed.tls.server_tls_cert_file !== undefined) config.server_tls_cert_file = parsed.tls.server_tls_cert_file;
        if (parsed.tls.server_tls_ca_file !== undefined) config.server_tls_ca_file = parsed.tls.server_tls_ca_file;
      }
      
      return config;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Error loading configuration file: ${error.message}`);
      }
      throw new Error(`Error loading configuration file: ${configPath}`);
    }
  }

  static mapCLIToConfig(cliOptions: CLIOptions): Partial<ServerConfig> {
    const config: Partial<ServerConfig> = {};
    
    if (cliOptions.listenPort !== undefined) {
      config.listen_port = cliOptions.listenPort;
    }
    
    if (cliOptions.listenHost !== undefined) {
      config.listen_host = cliOptions.listenHost;
    }
    
    if (cliOptions.serverHost !== undefined) {
      config.server_host = cliOptions.serverHost;
    }
    
    if (cliOptions.serverPort !== undefined) {
      config.server_port = cliOptions.serverPort;
    }
    
    if (cliOptions.poolMode !== undefined) {
      config.pool_mode = cliOptions.poolMode;
    }
    
    if (cliOptions.maxClientConn !== undefined) {
      config.max_client_conn = cliOptions.maxClientConn;
    }
    
    if (cliOptions.poolSize !== undefined) {
      config.pool_size = cliOptions.poolSize;
    }
    
    if (cliOptions.logConnections !== undefined) {
      config.log_connections = cliOptions.logConnections;
    }
    
    if (cliOptions.statsPeriod !== undefined) {
      config.stats_period = cliOptions.statsPeriod;
    }
    
    return config;
  }

  showConfig(): void {
    console.log('Current Configuration:');
    console.log('===================');
    console.log(`Listen Port:        ${this.config.listen_port}`);
    console.log(`Listen Host:        ${this.config.listen_host}`);
    console.log(`Server Host:        ${this.config.server_host}`);
    console.log(`Server Port:        ${this.config.server_port}`);
    console.log(`Pool Mode:          ${this.config.pool_mode}`);
    console.log(`Max Client Conn:    ${this.config.max_client_conn}`);
    console.log(`Pool Size:          ${this.config.pool_size}`);
    console.log(`Log Connections:    ${this.config.log_connections}`);
    console.log(`Log Disconnections: ${this.config.log_disconnections}`);
    console.log(`Stats Period:       ${this.config.stats_period}ms`);
    console.log(`Server Timeout:     ${this.config.server_connect_timeout}ms`);
    console.log(`Client Timeout:     ${this.config.client_login_timeout}ms`);
    console.log(`Client TLS Mode:    ${this.config.client_tls_mode}`);
    console.log(`Server TLS Mode:    ${this.config.server_tls_mode}`);
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

  get serverConnectTimeout(): number {
    return this.config.server_connect_timeout;
  }

  get clientLoginTimeout(): number {
    return this.config.client_login_timeout;
  }

  get serverIdleTimeout(): number {
    return this.config.server_idle_timeout;
  }

  get clientIdleTimeout(): number {
    return this.config.client_idle_timeout;
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