# pgbun - PostgreSQL Connection Pool and Proxy

## Project Overview

This is a PostgreSQL connection pool and proxy built with Bun and TypeScript, inspired by PgBouncer. The goal is to create a high-performance connection pooling solution that can handle client connections efficiently and proxy them to PostgreSQL servers.

## What We've Accomplished

### Foundation Complete ✅
- **Project Structure**: Set up complete TypeScript project with Bun
- **TCP Server**: Created server listening on port 6432 using Bun's native TCP capabilities
- **Connection Architecture**: Designed core connection pool and proxy architecture
- **PostgreSQL Protocol**: Implemented basic PostgreSQL wire protocol parsing
- **Build System**: Created standalone binary compilation (98MB executable)

### Core Components Implemented

1. **Entry Point** (`src/index.ts`): Main application entry with graceful shutdown handling
2. **Server** (`src/server.ts`): TCP server managing client connections on port 6432
3. **Configuration** (`src/config.ts`): Centralized configuration with pgbouncer-like settings
4. **Connection Handler** (`src/connection-handler.ts`): Orchestrates client-server communication
5. **Connection Pool** (`src/connection-pool.ts`): Manages PostgreSQL connection pools by database/user
6. **Protocol Handler** (`src/protocol.ts`): PostgreSQL wire protocol message parsing and creation

### Key Features Working
- ✅ TCP server listening on configurable port (default 6432)
- ✅ Basic PostgreSQL protocol message parsing (startup, query, terminate)
- ✅ Connection pooling infrastructure with session/transaction/statement modes
- ✅ Configurable pool sizes and connection limits
- ✅ Graceful shutdown handling
- ✅ Connection logging and basic statistics
- ✅ Standalone binary compilation

## Current Status

**What Works:**
- Server starts and accepts TCP connections
- Basic protocol parsing for client messages
- Connection pool management structure
- Configuration system

**What's Missing (Next Steps):**
- Actual PostgreSQL server connections (currently just mock responses)
- Real query proxying between client and server
- Authentication forwarding
- Transaction-level and statement-level pooling modes
- Connection health checks and reconnection logic

## Build and Run

```bash
# Development
bun run dev

# Build standalone binary
bun run compile

# Run binary
./pgbun
```

## Architecture

```
Client → pgbun (6432) → [Connection Pool] → PostgreSQL (5432)
```

The proxy accepts client connections, parses PostgreSQL protocol messages, manages connection pools per database/user combination, and will eventually forward requests to actual PostgreSQL servers.

## Next Development Steps

1. **Real PostgreSQL Connections**: Implement actual TCP connections to PostgreSQL servers
2. **Query Proxying**: Forward client queries to server and return responses
3. **Authentication**: Implement proper PostgreSQL authentication forwarding
4. **Transaction Pooling**: Implement transaction-level connection reuse
5. **Health Checks**: Add connection health monitoring and reconnection
6. **Configuration File**: Support external configuration files
7. **Monitoring**: Add metrics and admin interface

## Technical Notes

- Built with Bun's native TCP server for performance
- Uses TypeScript for type safety
- PostgreSQL wire protocol implementation handles binary message parsing
- Connection pools are organized by `database:user` keys
- Supports graceful shutdown with SIGINT/SIGTERM handling
- Default configuration mimics pgbouncer settings

## Current Limitations

- Only responds with mock data (doesn't actually connect to PostgreSQL yet)
- No SSL/TLS support
- No configuration file support
- Limited error handling for edge cases
- No admin interface or detailed statistics

This foundation provides a solid starting point for building a production-ready PostgreSQL connection pool and proxy.