# pgbun Configuration Reference

## Overview

pgbun supports multiple configuration methods with clear precedence: CLI options > environment variables > configuration files > defaults. This document provides a comprehensive reference for all configuration options.

## Configuration Precedence

1. **CLI Options** (highest priority)
2. **Environment Variables**
3. **Configuration Files**
4. **Defaults** (lowest priority)

## Configuration File Format

pgbun uses TOML format for configuration files:

```toml
[server]
listen_port = 6432
listen_host = "0.0.0.0"
server_host = "localhost"
server_port = 5432

[pool]
pool_mode = "session"
max_client_conn = 100
default_pool_size = 25
pool_size = 25
reserve_pool_size = 0
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

## Server Configuration

### `listen_port`
- **Type**: integer
- **Default**: 6432
- **Range**: 1-65535
- **Description**: Port for pgbun to listen on
- **CLI**: `--listen-port`
- **Env**: `PGBUN_LISTEN_PORT`

### `listen_host`
- **Type**: string
- **Default**: "0.0.0.0"
- **Description**: Host address for pgbun to listen on
- **CLI**: `--listen-host`
- **Env**: `PGBUN_LISTEN_HOST`

### `server_host`
- **Type**: string
- **Default**: "localhost"
- **Description**: PostgreSQL server host to connect to
- **CLI**: `--server-host`
- **Env**: `PGBUN_SERVER_HOST`

### `server_port`
- **Type**: integer
- **Default**: 5432
- **Range**: 1-65535
- **Description**: PostgreSQL server port to connect to
- **CLI**: `--server-port`
- **Env**: `PGBUN_SERVER_PORT`

## Pool Configuration

### `pool_mode`
- **Type**: string
- **Default**: "session"
- **Options**: "session", "transaction", "statement"
- **Description**: Connection pooling mode
- **CLI**: `--pool-mode`
- **Env**: `PGBUN_POOL_MODE`

**Mode Descriptions:**
- **session**: One server connection per client session
- **transaction**: One server connection per transaction, released after COMMIT/ROLLBACK
- **statement**: One server connection per statement (basic stub)

### `max_client_conn`
- **Type**: integer
- **Default**: 100
- **Range**: 1+
- **Description**: Maximum number of client connections
- **CLI**: `--max-client-conn`
- **Env**: `PGBUN_MAX_CLIENT_CONN`

### `default_pool_size`
- **Type**: integer
- **Default**: 25
- **Range**: 1+
- **Description**: Default pool size per database/user combination
- **CLI**: `--pool-size`
- **Env**: `PGBUN_POOL_SIZE`

### `pool_size`
- **Type**: integer
- **Default**: 25
- **Range**: 1+
- **Description**: Pool size per database/user combination
- **CLI**: `--pool-size`
- **Env**: `PGBUN_POOL_SIZE`

### `reserve_pool_size`
- **Type**: integer
- **Default**: 0
- **Range**: 0+
- **Description**: Number of connections to reserve for emergency use
- **CLI**: Not available
- **Env**: Not available

### `reserve_pool_timeout`
- **Type**: integer
- **Default**: 5000
- **Range**: 0+
- **Description**: Timeout in milliseconds for reserve pool connections
- **CLI**: Not available
- **Env**: Not available

## Logging Configuration

### `log_connections`
- **Type**: boolean
- **Default**: true
- **Description**: Log client connection events
- **CLI**: `--log-connections`
- **Env**: `PGBUN_LOG_CONNECTIONS`

### `log_disconnections`
- **Type**: boolean
- **Default**: true
- **Description**: Log client disconnection events
- **CLI**: Not available
- **Env**: Not available

### `log_pooler_errors`
- **Type**: boolean
- **Default**: true
- **Description**: Log pooler error events
- **CLI**: Not available
- **Env**: Not available

### `stats_period`
- **Type**: integer
- **Default**: 60000
- **Range**: 1000+
- **Description**: Statistics reporting interval in milliseconds
- **CLI**: `--stats-period`
- **Env**: `PGBUN_STATS_PERIOD`

## Timeout Configuration

### `server_connect_timeout`
- **Type**: integer
- **Default**: 15000
- **Range**: 1000+
- **Description**: Maximum time to wait when connecting to PostgreSQL (milliseconds)
- **CLI**: Not available
- **Env**: Not available

### `client_login_timeout`
- **Type**: integer
- **Default**: 60000
- **Range**: 1000+
- **Description**: Maximum time to wait for client authentication (milliseconds)
- **CLI**: Not available
- **Env**: Not available

### `server_idle_timeout`
- **Type**: integer
- **Default**: 600000
- **Range**: 0+
- **Description**: Cleanup idle PostgreSQL connections after this time (milliseconds, 0 = disabled)
- **CLI**: Not available
- **Env**: Not available

### `client_idle_timeout`
- **Type**: integer
- **Default**: 0
- **Range**: 0+
- **Description**: Cleanup idle client connections after this time (milliseconds, 0 = disabled)
- **CLI**: Not available
- **Env**: Not available

## TLS Configuration

### Client TLS Settings

#### `client_tls_mode`
- **Type**: string
- **Default**: "disable"
- **Options**: "disable", "allow", "prefer", "require", "verify-ca", "verify-full"
- **Description**: TLS mode for client connections
- **CLI**: Not available
- **Env**: Not available

#### `client_tls_key_file`
- **Type**: string
- **Default**: undefined
- **Description**: Path to client private key file (PEM format)
- **CLI**: Not available
- **Env**: Not available

#### `client_tls_cert_file`
- **Type**: string
- **Default**: undefined
- **Description**: Path to client certificate file (PEM format)
- **CLI**: Not available
- **Env**: Not available

#### `client_tls_ca_file`
- **Type**: string
- **Default**: undefined
- **Description**: Path to client CA certificate file (PEM format)
- **CLI**: Not available
- **Env**: Not available

### Server TLS Settings

#### `server_tls_mode`
- **Type**: string
- **Default**: "prefer"
- **Options**: "disable", "allow", "prefer", "require", "verify-ca", "verify-full"
- **Description**: TLS mode for server connections
- **CLI**: Not available
- **Env**: Not available

#### `server_tls_key_file`
- **Type**: string
- **Default**: undefined
- **Description**: Path to server private key file (PEM format)
- **CLI**: Not available
- **Env**: Not available

#### `server_tls_cert_file`
- **Type**: string
- **Default**: undefined
- **Description**: Path to server certificate file (PEM format)
- **CLI**: Not available
- **Env**: Not available

#### `server_tls_ca_file`
- **Type**: string
- **Default**: undefined
- **Description**: Path to server CA certificate file (PEM format)
- **CLI**: Not available
- **Env**: Not available

## Environment Variables

All configuration options can be set via environment variables with the `PGBUN_` prefix:

```bash
# Server settings
export PGBUN_LISTEN_PORT=6432
export PGBUN_LISTEN_HOST=0.0.0.0
export PGBUN_SERVER_HOST=localhost
export PGBUN_SERVER_PORT=5432

# Pool settings
export PGBUN_POOL_MODE=transaction
export PGBUN_MAX_CLIENT_CONN=200
export PGBUN_POOL_SIZE=50

# Logging settings
export PGBUN_LOG_CONNECTIONS=true
export PGBUN_STATS_PERIOD=60000

# Timeout settings
export PGBUN_SERVER_CONNECT_TIMEOUT=15000
export PGBUN_CLIENT_LOGIN_TIMEOUT=60000
export PGBUN_SERVER_IDLE_TIMEOUT=600000
export PGBUN_CLIENT_IDLE_TIMEOUT=0

# TLS settings
export PGBUN_CLIENT_TLS_MODE=disable
export PGBUN_SERVER_TLS_MODE=prefer
```

## Configuration Examples

### Development Configuration

```toml
[server]
listen_port = 6432
listen_host = "127.0.0.1"
server_host = "localhost"
server_port = 5432

[pool]
pool_mode = "session"
max_client_conn = 50
pool_size = 10

[logging]
log_connections = true
log_disconnections = true
stats_period = 30000

[timeouts]
server_connect_timeout = 10000
client_login_timeout = 30000
server_idle_timeout = 300000
client_idle_timeout = 0

[tls]
client_tls_mode = "disable"
server_tls_mode = "disable"
```

### Production Configuration

```toml
[server]
listen_port = 6432
listen_host = "0.0.0.0"
server_host = "db.example.com"
server_port = 5432

[pool]
pool_mode = "transaction"
max_client_conn = 500
pool_size = 100
reserve_pool_size = 10
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
client_tls_mode = "require"
client_tls_key_file = "/etc/pgbun/client.key"
client_tls_cert_file = "/etc/pgbun/client.crt"
client_tls_ca_file = "/etc/pgbun/ca.crt"
server_tls_mode = "prefer"
server_tls_ca_file = "/etc/pgbun/ca.crt"
```

### High-Performance Configuration

```toml
[server]
listen_port = 6432
listen_host = "0.0.0.0"
server_host = "localhost"
server_port = 5432

[pool]
pool_mode = "transaction"
max_client_conn = 1000
pool_size = 200
reserve_pool_size = 20
reserve_pool_timeout = 3000

[logging]
log_connections = false
log_disconnections = false
log_pooler_errors = true
stats_period = 30000

[timeouts]
server_connect_timeout = 5000
client_login_timeout = 30000
server_idle_timeout = 300000
client_idle_timeout = 0

[tls]
client_tls_mode = "disable"
server_tls_mode = "disable"
```

## Configuration Validation

pgbun validates configuration on startup and provides clear error messages:

```bash
# Validate configuration without starting
pgbun --dry-run --config /etc/pgbun.conf

# Show current configuration
pgbun config --config /etc/pgbun.conf
```

### Common Validation Errors

1. **Invalid port range**: `Invalid listen_port: 99999. Must be between 1 and 65535`
2. **Invalid pool mode**: `Invalid pool_mode: 'invalid'. Must be one of: session, transaction, statement`
3. **Invalid timeout**: `Invalid server_connect_timeout: 500. Must be at least 1000ms`
4. **Missing TLS files**: `TLS mode is enabled, but key/cert files are not configured`

## Best Practices

1. **Use configuration files** for complex setups
2. **Set appropriate timeouts** based on your network conditions
3. **Enable TLS in production** environments
4. **Monitor connection statistics** regularly
5. **Use transaction mode** for high-concurrency applications
6. **Set reserve pool size** for emergency connections
7. **Enable connection logging** for debugging
8. **Use environment variables** for sensitive configuration
9. **Validate configuration** before deployment
10. **Document configuration changes** for team members