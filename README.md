# 🐘 pgbun 🐇

A high-performance PostgreSQL connection pool and proxy built with [Bun](https://bun.sh) and TypeScript. Inspired by [PgBouncer](https://www.pgbouncer.org/), pgbun provides efficient connection pooling for PostgreSQL databases with modern JavaScript/TypeScript tooling.

## Features

- **High Performance**: Built on Bun's fast runtime and optimized TCP handling
- **Connection Pooling**: Efficient connection management with configurable pool modes
- **Connection Timeouts**: PgBouncer-compatible timeout settings for robust connection management
- **PostgreSQL Wire Protocol**: Native PostgreSQL protocol support with full query proxying
- **Real Server Connections**: Establishes actual TCP connections to PostgreSQL servers
- **Bidirectional Proxying**: Transparent query forwarding and response proxying
- **Lightweight**: Single binary deployment (~98MB)
- **TypeScript**: Full type safety and modern development experience
- **Configurable**: Flexible configuration options for different use cases

## Installation

### From Source

```bash
git clone <repository-url>
cd pgbun
bun install
bun run compile
```

This creates a standalone `pgbun` binary.

### Development

```bash
bun run dev  # Run with hot reload
```

## Usage

### Basic Usage

```bash
# Start with defaults
./pgbun

# Start with custom options
./pgbun --listen-port 6433 --pool-mode transaction --max-client-conn 200

# Use configuration file
./pgbun --config /etc/pgbun.conf

# Show current configuration
./pgbun config

# Validate configuration without starting
./pgbun --dry-run --config /etc/pgbun.conf
```

The proxy will start listening on port 6432 and forward connections to PostgreSQL on localhost:5432.

### Configuration

pgbun supports multiple configuration methods with the following precedence (highest to lowest):
1. **CLI options** - Command line arguments
2. **Environment variables** - System environment
3. **Configuration file** - TOML format
4. **Defaults** - Built-in sensible defaults

#### Default Configuration

- **Listen Port**: 6432
- **Listen Host**: 0.0.0.0
- **PostgreSQL Server**: localhost:5432
- **Pool Mode**: 'session' (options: 'session', 'transaction', 'statement')
- **Max Client Connections**: 100
- **Pool Size**: 25
- **TLS Mode**: Client 'disable', Server 'prefer'

### Connection Timeouts

pgbun includes PgBouncer-compatible connection timeout settings:

- **server_connect_timeout**: 15 seconds - Maximum time to wait when connecting to PostgreSQL
- **client_login_timeout**: 60 seconds - Maximum time to wait for client authentication  
- **server_idle_timeout**: 10 minutes - Cleanup idle PostgreSQL connections after this time
- **client_idle_timeout**: disabled - Cleanup idle client connections (0 = disabled)

#### Configuration File

Create a TOML configuration file (e.g., `pgbun.conf`):

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

[logging]
log_connections = true
log_disconnections = true
stats_period = 60000

[timeouts]
server_connect_timeout = 15000
client_login_timeout = 60000
server_idle_timeout = 600000
client_idle_timeout = 0

[tls]
client_tls_mode = "disable"
server_tls_mode = "prefer"
```

#### Environment Variables

Set environment variables for configuration:

```bash
export PGBUN_LISTEN_PORT=6432
export PGBUN_POOL_MODE=transaction
export PGBUN_MAX_CLIENT_CONN=200
export PGBUN_LOG_CONNECTIONS=true
```

#### CLI Options

Use command line options for runtime configuration:

```bash
./pgbun --listen-port 6433 --pool-mode transaction --max-client-conn 200 --verbose
```

See `./pgbun --help` for all available options.

For detailed configuration information, see:
- [CLI Reference](CLI.md) - Complete command-line interface documentation
- [Configuration Reference](CONFIG.md) - All configuration options and examples
- [TLS/SSL Configuration](TLS.md) - SSL/TLS setup and security configuration

## Testing

This project uses `bun:test` for running tests. The tests are located in the `tests/` directory and are separated into `unit` and `integration` tests.

To run all tests, use the following command:

```bash
bun test
```

## Architecture

```
Client → pgbun (6432) → [Connection Pool] → PostgreSQL (5432)
          ↓                                          ↓
    Parse/Forward ←——————————————————————— Proxy Back
```

pgbun acts as a transparent proxy, establishing real connections to PostgreSQL servers and efficiently proxying queries and responses bidirectionally.

### Core Components

- **Server** (`src/server.ts`): TCP server handling client connections
- **Connection Pool** (`src/connection-pool.ts`): Manages real PostgreSQL connections with authentication
- **Protocol Handler** (`src/protocol.ts`): Full PostgreSQL wire protocol implementation
- **Connection Handler** (`src/connection-handler.ts`): Orchestrates bidirectional client-server communication
- **Configuration** (`src/config.ts`): Centralized configuration management

### Pool Modes

pgbun supports three pooling modes, configurable via `pool_mode` in the config:

- **Session** (default): Dedicates a single server connection to the client for the entire session lifetime. Suitable for applications that maintain long-lived sessions with stateful connections.
- **Transaction**: Assigns a server connection per transaction, reusing within the transaction (BEGIN to COMMIT/ROLLBACK) and automatically releasing after transaction end. Detected via PostgreSQL protocol messages for transparent operation. Now fully implemented.
- **Statement**: Assigns a server connection per individual statement/query. Basic stub implemented (gets/releases per query); full Parse/Bind/Execute support pending for prepared statements.

- **Session**: Connection assigned for entire client session (default)
- **Transaction**: Connection assigned per transaction
- **Statement**: Connection assigned per statement

## Development

### Commands

```bash
bun run dev        # Development with hot reload
bun run build      # Build for production
bun run compile    # Create standalone binary
bun run start      # Run built version
```

### Project Structure

```
src/
├── index.ts              # Entry point with CLI integration
├── cli.ts                # Command line interface parser
├── server.ts             # TCP server implementation
├── connection-handler.ts # Client request handling and session management
├── connection-pool.ts    # Connection pool management with SSL support
├── protocol.ts           # PostgreSQL wire protocol parser
└── config.ts             # Configuration management with file/env/CLI support

tests/
├── unit/                 # Unit tests
├── integration/          # Integration tests
├── load-test.js          # Load testing script
└── transaction-test.js   # Transaction boundary testing

docker/
├── docker-compose.yml    # Development environment
├── Dockerfile.bun       # pgbun container
├── Dockerfile.test      # Test runner container
└── docker-entrypoint-initdb.d/init.sql  # Test database setup
```

## Docker Development Environment

pgbun includes a self-contained Docker Compose setup for development and testing. This hermetic environment runs PostgreSQL, the pgbun proxy, and a Bun-based test runner to simulate workloads, validate pooling modes, and measure performance without external dependencies.

### Prerequisites
- Docker (v20+) and Docker Compose (v2+)

### Quick Start
1. **Prepare Environment**:
   Copy `.env.example` to `.env` and adjust variables (e.g., `POOL_MODE=transaction`).

2. **Build and Launch**:
   ```bash
   docker compose up -d --build
   ```
   - Starts PostgreSQL (with init DB/tables), pgbun (proxy on localhost:6432), and prepares test-runner.
   - Wait ~30s for readiness; check with `docker compose ps`.

3. **Run Tests**:
   - **Load Test** (concurrent queries, metrics):
     ```bash
     docker compose run --rm test-runner load-test.js --mode=transaction --concurrency=100 --duration=60s --scenario=load
     ```
   - **Transaction Test** (boundaries, edge cases):
     ```bash
     docker compose run --rm test-runner transaction-test.js --mode=transaction --concurrency=20 --duration=30s --scenario=boundary
     ```
   - **Statement Mode Stub**:
     ```bash
     docker compose run --rm test-runner load-test.js --mode=statement --concurrency=50 --duration=20s
     ```
   - Outputs JSON metrics (e.g., reuse_efficiency_percent, avg_latency_ms) to stdout. Redirect: `> metrics.json`.

4. **Hot-Reload for Development**:
   - Edit files in `./src/`; pgbun container watches and recompiles automatically (no restart needed).
   - Restart pgbun if config changes: `docker compose restart pgbun`.

5. **Manual Testing**:
   - Connect via psql: `psql -h localhost -p 6432 -U pgbun_user -d pgbun_test` (password: pgbun_pass).
   - View logs: `docker compose logs -f pgbun` or `docker compose logs postgres`.

6. **Teardown**:
   ```bash
   docker compose down -v  # Removes volumes (DB data) for clean redeploy
   ```

### Configuration
- Env vars in `.env` control pgbun (e.g., `POOL_MODE`, timeouts).
- Test params: `--mode` (session/transaction/statement), `--concurrency` (1-200), `--duration` (seconds), `--scenario` (load/boundary/idle/rollback/statement).
- Metrics include: total_queries, errors, latencies, throughput_qps, reuse_efficiency_percent (estimates pooling; extend pgbun logs for precision).

### Files
- `docker-compose.yml`: Orchestrates services.
- `Dockerfile.bun`: Builds/runs pgbun with hot-reload.
- `Dockerfile.test`: Bun test-runner with `pg` client.
- `docker-entrypoint-initdb.d/init.sql`: Sets up test DB/tables.
- `tests/load-test.js` & `tests/transaction-test.js`: Parameterized scripts for workloads.

For advanced benchmarking, extend with pgbench in test-runner. See [Docker docs](https://docs.docker.com/compose/) for troubleshooting.

## Status

### ✅ Implemented

- **Core Functionality**: Real PostgreSQL server connections with bidirectional query proxying
- **Protocol Support**: Complete PostgreSQL wire protocol parsing and message creation
- **Connection Pooling**: 
  - Session-level connection pooling (default)
  - Transaction-level connection pooling with automatic release on COMMIT/ROLLBACK
  - Basic statement-level pooling stub (per-query assignment/release)
- **Configuration**: 
  - CLI interface with comprehensive options
  - Configuration file support (TOML format)
  - Environment variable overrides
  - Configuration validation and dry-run mode
- **Security**: 
  - SSL/TLS support for both client and server connections
  - Multiple TLS modes (disable, allow, prefer, require, verify-ca, verify-full)
- **Connection Management**: 
  - Connection timeouts and limits (PgBouncer-compatible)
  - Automatic idle connection cleanup
  - Graceful shutdown handling
- **Development**: 
  - Standalone binary compilation (~98MB)
  - Docker development environment with hot-reload
  - Comprehensive test suite with load testing

### 🚧 Roadmap

- [x] Transaction-level pooling
- [x] Configuration file support  
- [x] SSL/TLS support
- [ ] Full statement-level pooling (prepared statements support)
- [ ] Connection health checks and automatic reconnection
- [ ] Metrics and monitoring interface
- [ ] Multiple database/server support
- [ ] Load balancing across servers
- [ ] Admin interface and statistics

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Acknowledgments

- Inspired by [PgBouncer](https://www.pgbouncer.org/)
- Built with [Bun](https://bun.sh)
- PostgreSQL wire protocol reference
