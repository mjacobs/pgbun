# pgbun CLI Reference

## Overview

pgbun provides a comprehensive command-line interface for configuration, operation, and management. The CLI supports multiple configuration methods with clear precedence: CLI options > environment variables > configuration files > defaults.

## Usage

```bash
pgbun [OPTIONS] [COMMAND]
```

## Commands

### `start` (default)
Start the connection pool server.

```bash
pgbun start
pgbun start --listen-port 6433 --pool-mode transaction
```

### `config`
Display current configuration without starting the server.

```bash
pgbun config
pgbun config --config /etc/pgbun.conf
```

### `version`
Show version information.

```bash
pgbun version
pgbun --version
```

### `help`
Show help information.

```bash
pgbun help
pgbun --help
```

## Connection Options

### `-p, --listen-port <PORT>`
Set the port for pgbun to listen on.

- **Default**: 6432
- **Range**: 1-65535
- **Example**: `--listen-port 6433`

### `--listen-host <HOST>`
Set the host address for pgbun to listen on.

- **Default**: 0.0.0.0
- **Example**: `--listen-host 127.0.0.1`

### `--server-host <HOST>`
Set the PostgreSQL server host to connect to.

- **Default**: localhost
- **Example**: `--server-host db.example.com`

### `--server-port <PORT>`
Set the PostgreSQL server port to connect to.

- **Default**: 5432
- **Range**: 1-65535
- **Example**: `--server-port 5433`

## Pool Options

### `--pool-mode <MODE>`
Set the connection pooling mode.

- **Default**: session
- **Options**: session, transaction, statement
- **Example**: `--pool-mode transaction`

**Mode Descriptions:**
- **session**: One server connection per client session (default)
- **transaction**: One server connection per transaction, released after COMMIT/ROLLBACK
- **statement**: One server connection per statement (basic stub implementation)

### `--max-client-conn <NUM>`
Set the maximum number of client connections.

- **Default**: 100
- **Range**: 1+
- **Example**: `--max-client-conn 200`

### `--pool-size <NUM>`
Set the default pool size per database/user combination.

- **Default**: 25
- **Range**: 1+
- **Example**: `--pool-size 50`

## Configuration Options

### `-c, --config <FILE>`
Specify a configuration file path.

- **Format**: TOML
- **Example**: `--config /etc/pgbun.conf`

### `--env <ENV>`
Set the environment mode.

- **Options**: dev, prod, test
- **Example**: `--env prod`

### `--dry-run`
Validate configuration without starting the server.

```bash
pgbun --dry-run --config /etc/pgbun.conf
```

## Logging Options

### `-v, --verbose`
Enable verbose logging.

```bash
pgbun --verbose
```

### `-q, --quiet`
Suppress non-error output.

```bash
pgbun --quiet
```

### `--log-level <LEVEL>`
Set the log level.

- **Default**: info
- **Options**: debug, info, warn, error
- **Example**: `--log-level debug`

### `--log-connections`
Enable connection event logging.

```bash
pgbun --log-connections
```

### `--stats-period <MS>`
Set the statistics reporting interval in milliseconds.

- **Default**: 60000 (1 minute)
- **Example**: `--stats-period 30000`

## Operational Options

### `-d, --daemon`
Run as a daemon process.

```bash
pgbun --daemon
```

### `--pid-file <FILE>`
Write the process ID to a file.

```bash
pgbun --daemon --pid-file /var/run/pgbun.pid
```

## Environment Variables

pgbun supports configuration via environment variables with the `PGBUN_` prefix:

```bash
export PGBUN_LISTEN_PORT=6432
export PGBUN_LISTEN_HOST=0.0.0.0
export PGBUN_SERVER_HOST=localhost
export PGBUN_SERVER_PORT=5432
export PGBUN_POOL_MODE=transaction
export PGBUN_MAX_CLIENT_CONN=200
export PGBUN_POOL_SIZE=50
export PGBUN_LOG_CONNECTIONS=true
export PGBUN_STATS_PERIOD=60000
```

## Configuration File Format

pgbun supports TOML configuration files:

```toml
[server]
listen_port = 6432
listen_host = "0.0.0.0"
server_host = "localhost"
server_port = 5432

[pool]
pool_mode = "transaction"
max_client_conn = 200
pool_size = 50
reserve_pool_size = 5
reserve_pool_timeout = 5000

[logging]
log_connections = true
log_disconnections = true
log_pooler_errors = true
stats_period = 60000

[timeouts]
server_connect_timeout = 15000
client_login_timeout = 60000
server_idle_timeout = 600000
client_idle_timeout = 0

[tls]
client_tls_mode = "disable"
client_tls_key_file = "/path/to/client.key"
client_tls_cert_file = "/path/to/client.crt"
client_tls_ca_file = "/path/to/ca.crt"
server_tls_mode = "prefer"
server_tls_key_file = "/path/to/server.key"
server_tls_cert_file = "/path/to/server.crt"
server_tls_ca_file = "/path/to/ca.crt"
```

## Examples

### Basic Usage
```bash
# Start with defaults
pgbun

# Start with custom port
pgbun --listen-port 6433

# Start in transaction mode
pgbun --pool-mode transaction
```

### Configuration Management
```bash
# Show current configuration
pgbun config

# Validate configuration file
pgbun --dry-run --config /etc/pgbun.conf

# Use environment variables
PGBUN_POOL_MODE=transaction pgbun
```

### Production Deployment
```bash
# Run as daemon with PID file
pgbun --daemon --pid-file /var/run/pgbun.pid --config /etc/pgbun.conf

# Enable verbose logging
pgbun --verbose --log-connections --stats-period 30000
```

### Development
```bash
# Development with hot reload
bun run dev

# Test configuration
pgbun --dry-run --verbose --config dev.conf
```

## Error Handling

pgbun provides clear error messages for common issues:

- **Invalid port**: `Invalid port value: 99999`
- **Invalid pool mode**: `Invalid pool mode 'invalid'. Must be one of: session, transaction, statement`
- **Missing config file**: `Configuration file not found: /path/to/missing.conf`
- **Invalid log level**: `Invalid log level 'invalid'. Must be one of: debug, info, warn, error`

## Exit Codes

- **0**: Success
- **1**: General error (configuration, runtime)
- **2**: Invalid command line arguments

## Integration

### Systemd Service
```ini
[Unit]
Description=pgbun PostgreSQL Connection Pool
After=network.target

[Service]
Type=simple
User=pgbun
ExecStart=/usr/local/bin/pgbun --daemon --pid-file /var/run/pgbun.pid --config /etc/pgbun.conf
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Docker
```dockerfile
FROM oven/bun:1-alpine
COPY pgbun /usr/local/bin/
COPY pgbun.conf /etc/pgbun.conf
EXPOSE 6432
CMD ["pgbun", "--config", "/etc/pgbun.conf"]
```

### Process Management
```bash
# Start with nohup
nohup pgbun --daemon --pid-file /var/run/pgbun.pid &

# Stop gracefully
kill -TERM $(cat /var/run/pgbun.pid)

# Check status
pgbun config --config /etc/pgbun.conf
```