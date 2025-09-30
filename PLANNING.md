Short-term roadmap (3-6 months) with prioritized list of tasks.

**STATUS UPDATE**: Many items from the original roadmap have been completed, including transaction-level pooling, configuration file support, SSL/TLS support, and CLI interface. This document has been updated to reflect current implementation status and focus on remaining tasks.

TL:DR; build directly on the existing PostgreSQLProtocol for message handling and Config for poolMode support, extending to statement-level pooling and health checks as outlined in the existing roadmap Direction 1 short-term phase. Tasks are broken into phases for implementation: Preparation, Core Implementation, HA Enhancements, and Validation. Each task includes estimated effort (low/medium/high) and dependencies.

### Short-Term Roadmap: Advanced Pooling and HA Functionality

#### Phase 1: Preparation (1-2 weeks, Low Effort)

- [x] ✅ Review and update Config to fully enable 'transaction' poolMode validation and default to it for testing; add config options for transaction detection (e.g., via message types like Begin/Commit). Depends on existing Config class getters.
- [x] ✅ Enhance PostgreSQLProtocol to parse transaction boundaries (e.g., detect 'Begin', 'Commit', 'Rollback' messages in parseServerMessage and expose via a new method like isTransactionEnd(message)). Builds on existing parseQuery and createReadyForQuery.
- [x] ✅ Add unit tests for transaction message parsing in tests/unit/ using existing test structure. Depends on Phase 1 task 1.

#### Phase 2: Core Implementation - Statement Pooling (4-6 weeks, Medium Effort)

- [x] ✅ Modify ConnectionPool.getConnection to support transaction mode: Assign connections per transaction instead of session, tracking via a session ID and releasing on ReadyForQuery after Commit/Rollback. Extend existing getConnection logic with mode check from Config.poolMode.
- [x] ✅ Update releaseConnection to automatically trigger on transaction end detection (integrate with protocol parsing); add a new method like releaseOnTransactionEnd(connection, messages) that calls existing releaseConnection.
- [x] ✅ Integrate transaction pooling into ConnectionHandler.handleQuery: Proxy queries while monitoring for transaction ends in processClientMessage, calling pool.releaseConnection when detected. Depends on existing setupServerToClientProxy.
- [ ] Implement full statement pooling (prepared statements support): Complete the statement mode implementation with proper Parse/Bind/Execute support for prepared statements.
- [ ] Add integration tests for statement pooling in tests/integration/, simulating prepared statement sessions with pg client and verifying connection reuse/release. Depends on Phase 2 task 4.

#### Phase 3: HA Enhancements - Basic Health Checks (3-4 weeks, Medium Effort)

- [ ] Add periodic health checks in ConnectionPool: Extend cleanupIdleConnections to include a ping mechanism (send a simple 'SELECT 1' query via protocol.createQueryMessage and check response in authenticateServerConnection-like logic) every serverIdleTimeout interval for idle connections.
- [ ] Implement automatic reconnection with exponential backoff: In createConnection, if authentication fails or socket errors occur, retry up to 3 times with delays (100ms, 200ms, 400ms); update connection.lastUsed on success. Builds on existing error handling in createConnection.
- [ ] Enhance getStats to include health metrics (e.g., lastPingTime, healthStatus: 'healthy'|'unhealthy'); expose via a new endpoint in server.ts or console logging.
- [ ] Add reconnection tests: Simulate server downtime in integration tests (e.g., using a mock PostgreSQL server) and verify pool recovery without leaking connections.

#### Phase 4: Validation and Refinements (2 weeks, Low Effort)

- [ ] Run benchmarks comparing session vs. transaction vs. statement pooling performance (e.g., using Artillery or simple Bun script to simulate 1000 concurrent transactions); target 2x improvement in connection efficiency over session mode.
- [x] ✅ Update documentation in README.md and ROADMAP.md with new features, usage examples for transaction mode, and HA config options.
- [ ] Create GitHub issues for each remaining task, set up CI/CD in .github/workflows for automated testing on pull requests, and conduct a code review for performance regressions using Bun's profiling.
- [ ] Perform security audit for new pooling logic (e.g., ensure no connection leaks in transaction mode) and basic load testing.

This roadmap allocates ~70% effort to pooling enhancements and 30% to HA, aligning with high priority. Total estimated timeline: 6-10 weeks remaining, assuming 1-2 developers. Risks include protocol parsing edge cases (mitigate with extensive tests) and performance overhead (mitigate with benchmarks). Upon completion, pgbun will support statement-level pooling for better scalability and basic HA for resilience, positioning it closer to PgBouncer parity in these areas.

## Completed Achievements

- ✅ **Transaction Pooling**: Fully implemented with automatic release on COMMIT/ROLLBACK
- ✅ **Configuration System**: CLI interface, TOML config files, environment variables
- ✅ **SSL/TLS Support**: Complete implementation for both client and server connections
- ✅ **Docker Environment**: Full development and testing environment with hot-reload
- ✅ **Protocol Implementation**: Complete PostgreSQL wire protocol support
- ✅ **Connection Management**: Timeouts, idle cleanup, graceful shutdown
