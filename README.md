# pgbun

A high-performance PostgreSQL connection pool and proxy built with [Bun](https://bun.sh) and TypeScript. Inspired by [PgBouncer](https://www.pgbouncer.org/), pgbun provides efficient connection pooling for PostgreSQL databases with modern JavaScript/TypeScript tooling.

## Features

- **High Performance**: Built on Bun's fast runtime and optimized TCP handling
- **Connection Pooling**: Efficient connection management with configurable pool modes
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
./pgbun
```

The proxy will start listening on port 6432 and forward connections to PostgreSQL on localhost:5432.

### Configuration

pgbun uses sensible defaults but can be configured for your environment:

- **Listen Port**: 6432 (default)
- **PostgreSQL Server**: localhost:5432 (default)
- **Pool Mode**: session (default)
- **Max Connections**: 100 (default)
- **Pool Size**: 25 (default)

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
├── index.ts              # Entry point
├── server.ts             # TCP server
├── connection-handler.ts # Client request handling
├── connection-pool.ts    # Connection pool management
├── protocol.ts           # PostgreSQL protocol parser
└── config.ts             # Configuration management
```

## Status

### ✅ Implemented
- Real PostgreSQL server connections
- PostgreSQL protocol parsing and message creation
- Bidirectional query proxying
- Connection pool management with authentication
- Session-level connection pooling
- Graceful shutdown handling
- Standalone binary compilation

### 🚧 Roadmap
- [ ] Transaction-level pooling
- [ ] Statement-level pooling
- [ ] Connection health checks and reconnection
- [ ] Metrics and monitoring interface
- [ ] Configuration file support
- [ ] SSL/TLS support
- [ ] Multiple database/server support
- [ ] Load balancing across servers
- [ ] Admin interface and statistics
- [ ] Connection timeouts and limits

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