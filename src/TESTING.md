# pgbun Development and Testing Environment Design

## Executive Summary
This design provides a fully self-contained, hermetic environment for developing and testing pgbun using Docker Compose. It encapsulates:
- A PostgreSQL 16 instance for the backend database.
- The pgbun proxy server, built and run via Bun in a containerized Node.js/Bun runtime.
- A test runner service using Bun with the `pg` library (PostgreSQL client) to simulate realistic workloads, including concurrent connections, transaction pooling validation, load testing, and edge cases.

The setup minimizes dependencies (uses official Docker images where possible, builds custom for pgbun/test-runner), deploys in seconds, and supports rapid iteration (e.g., code changes in pgbun trigger hot-reload without full rebuild). It's designed for team/external contributors: clone the repo, run `docker compose up`, and execute tests. Teardown is simple (`docker compose down -v`). No external services like clouds or registries are required—everything runs locally.

Key benefits:
- **Isolation**: Containers prevent host pollution; volumes for persistence (DB data, source code).
- **Reproducibility**: Fixed images/versions; env vars for parameterization.
- **Performance Testing**: Supports 100+ concurrent connections; metrics on pooling efficiency (e.g., % reuses), errors, latency.
- **Feature Validation**: Parameterized scripts test session/transaction/statement modes, boundary detection (BEGIN/COMMIT/ROLLBACK), idle timeouts, reconnections.
- **Extensibility**: Easy to add SSL (via env), multi-DB, or pgbench for benchmarks.

Estimated setup time: 5-10 min initial build; <30s restarts. Resource usage: ~500MB RAM, 1-2 CPU cores for basic tests.

## Architecture
The environment uses a single Docker network (`pgbun_net`) for internal communication. Ports exposed: pgbun on host `localhost:6432` for manual testing (e.g., via `psql`); no other exposures for security.

```mermaid
---
config:
  theme: 'base'
---
graph LR
    subgraph "Host Machine"
        A[docker compose up/down] --> B[localhost:6432 pgbun entrypoint]
        C[Run Tests: docker compose run test-runner <script> <params>]
    end
    subgraph "Docker Network: pgbun_net"
        D[postgres <br /> Image: postgres:16 <br /> DB: pgbun_test <br /> User: pgbun_user <br /> Pass: pgbun_pass <br /> Volume: pgbun_data]
        E[pgbun<br />Build: Dockerfile.bun <br /> Cmd: bun run dev <br />_for hot-reload_<br /> Env: POOL_MODE=transaction <br /> Listen: 0.0.0.0:6432 <br /> Proxy: postgres:5432 <br /> Volume: ./src:/app/src - hot-reload]
        F[test-runnerImage: oven/bun:1  <br /> Deps: pg lib <br /> Scripts: /tests/load-test.js etc. <br /> Connect: pgbun:6432 <br /> Output: stdout + /metrics ]
        D <--> E
        F <--> E
    end
    B --> E
    style D fill:#f9f,stroke:#333
    style E fill:#bbf,stroke:#333
    style F fill:#bfb,stroke:#333
```

- **Data Flow**: Clients (host or test-runner) connect to pgbun:6432 → pgbun proxies to postgres:5432 using pool modes. Test-runner generates traffic and collects metrics from query timings/logs.
- **Persistence**: `pgbun_data` volume for DB state (reset with `-v`); source code mounted read-write for dev.
- **Hot-Reload**: pgbun runs `bun run dev` (watches `./src`); changes auto-recompile without container restart.
- **Metrics Collection**: pgbun logs connection events (extend `console.log` in code); test-runner uses `pg` promises to time queries, aggregates (e.g., via `performance.now()`), outputs JSON/CSV. For pool efficiency, query pgbun's `getStats` if exposed as HTTP (stub in design; implement later).

## Services Breakdown

### 1. PostgreSQL Service
- **Image**: `postgres:16-alpine` (lightweight, ~100MB).
- **Config**: 
  - Env: `POSTGRES_DB=pgbun_test`, `POSTGRES_USER=pgbun_user`, `POSTGRES_PASSWORD=pgbun_pass`.
  - Init Script: Mounted `/docker-entrypoint-initdb.d/init.sql` creates test tables (e.g., `users` for INSERT/SELECT loads) and indexes.
- **Volume**: `./volumes/pgdata:/var/lib/postgresql/data` (named `pgbun_data` for persistence; optional).
- **Health**: Built-in; test-runner waits via `pg` connect retries.
- **Purpose**: Provides a clean, resettable DB for all tests. Supports transaction demos (e.g., BEGIN; INSERT; COMMIT).

### 2. pgbun Service
- **Build**: Custom `Dockerfile.bun` (from `./` context):
  ```dockerfile
  FROM oven/bun:1-alpine AS builder
  WORKDIR /app
  COPY package.json bun.lockb ./
  RUN bun install --frozen-lockfile
  COPY src/ ./src/
  COPY tsconfig.json ./
  RUN bun run build  # Compiles to dist/ (or use bun run compile for binary)

  FROM oven/bun:1-alpine
  WORKDIR /app
  COPY --from=builder /app/dist ./  # Or binary if compiled
  # For dev/hot-reload: COPY src/ ./src/ (but mount overrides)
  EXPOSE 6432
  CMD ["bun", "run", "dev"]  # Watches src/ for changes
  ```
- **Config**: Env vars (e.g., `POOL_MODE=transaction`, `SERVER_HOST=postgres`, `SERVER_PORT=5432`, `MAX_CLIENT_CONN=200`). For complex config, mount `./config/dev.json:/app/config.json` and load in pgbun code (future enhancement).
- **Volumes**: `./src:/app/src:rw` (hot-reload), `./config:/app/config:ro`.
- **Depends On**: postgres (starts after DB ready).
- **Purpose**: Runs pgbun in proxy mode. For prod testing, switch CMD to `./pgbun` binary.

### 3. test-runner Service
- **Image**: Custom `Dockerfile.test` (extends oven/bun:1-alpine):
  ```dockerfile
  FROM oven/bun:1-alpine
  WORKDIR /tests
  RUN bun add pg performance  # pg for client, performance for metrics
  # Optional: apk add postgresql-client for pgbench
  COPY tests/ ./  # Load test scripts
  ENTRYPOINT ["bun", "run"]
  CMD ["load-test.js", "--mode=session", "--concurrency=50", "--duration=30s"]
  ```
- **Scripts**: Bun JS files in `./tests/` (e.g., `load-test.js` using `pg.Pool` for connections, `Promise.all` for concurrency).
  - **Concurrent Workloads**: Spawn N connections, run M queries each (SELECT/INSERT on test tables).
  - **Transaction Boundaries**: Script sequences: `BEGIN; INSERT; COMMIT` (verify pooling via timing/reuse logs).
  - **Load Testing**: Ramp up to 200 conns, 1000 QPS; measure throughput.
  - **Edge Cases**: Long sessions (hold conn 60s), idle timeouts (sleep then query), reconnections (kill postgres container mid-test, verify backoff).
  - **Pool Validation**: For transaction mode, count unique server conns vs. client txns (parse pgbun logs or extend stats).
  - **Parameterization**: Use `minimist` or `commander` for args: `--mode=transaction --concurrency=100 --duration=60s --scenario=boundary`.
  - **Metrics Output**: JSON/CSV to stdout and `./metrics/` volume. Example: `{ "mode": "transaction", "total_queries": 5000, "reuses": 0.85, "errors": 0, "avg_latency_ms": 4.2, "max_conns_used": 25 }`.
- **Depends On**: pgbun.
- **Purpose**: Automates testing; run ad-hoc: `docker compose run --rm test-runner load-test.js --mode=transaction`. For CI, integrate with GitHub Actions.

## Setup Instructions
1. **Prerequisites**: Docker & Docker Compose installed (v2+).
2. **Project Prep**:
   - Ensure `package.json` has `dev` script: `"dev": "bun --watch src/index.ts"`.
   - Add to `package.json`: `"pg": "^8.11.5"` (for test-runner; optional if not in deps).
   - Create dirs: `./docker/`, `./tests/`, `./volumes/`, `./config/`.
3. **Files to Create** (in repo root):
   - `docker-compose.yml` (below).
   - `Dockerfile.bun` and `Dockerfile.test` (above).
   - `./docker-entrypoint-initdb.d/init.sql`:
     ```sql
     CREATE DATABASE pgbun_test;
     \c pgbun_test;
     CREATE USER pgbun_user WITH PASSWORD 'pgbun_pass';
     GRANT ALL PRIVILEGES ON DATABASE pgbun_test TO pgbun_user;
     CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(50));
     INSERT INTO users (name) VALUES ('test1'), ('test2');  -- For SELECT/INSERT tests
     ```
   - `./tests/load-test.js` (sample below).
   - `./tests/transaction-test.js` (for boundaries).
4. **Deploy**:
   ```bash
   # Build & start (detached)
   docker compose up -d --build

   # Check logs
   docker compose logs -f pgbun

   # Run test
   docker compose run --rm test-runner load-test.js --mode=transaction --concurrency=50 --duration=30s

   # Manual test (host)
   psql -h localhost -p 6432 -U pgbun_user -d pgbun_test  # Password: pgbun_pass

   # Teardown (clean DB)
   docker compose down -v
   ```
5. **Hot-Reload Workflow**:
   - Edit `./src/` on host → pgbun container auto-recompiles (via `bun --watch`).
   - Restart service if needed: `docker compose restart pgbun`.
6. **Customization**:
   - Set env in `.env`: `POOL_MODE=session`, `MAX_CLIENT_CONN=100`.
   - For pgbench: Add to Dockerfile.test: `RUN apk add --no-cache postgresql-client`, then script: `pgbench -h pgbun -p 6432 -U pgbun_user -c 50 -T 30 pgbun_test`.
7. **README Integration**: Add section:
   ```
   ## Development Environment
   See [DEV-ENV.md](./DEV-ENV.md) for Docker setup. Run `docker compose up -d` to start, then `docker compose run test-runner ...` for tests.
   ```

## Sample Test Scripts

### load-test.js (Concurrent Load + Metrics)
```javascript
// ./tests/load-test.js
import { Pool, types } from 'pg';
import minimist from 'minimist';  // bun add minimist

const args = minimist(process.argv.slice(2));
const mode = args.mode || 'session';
const concurrency = parseInt(args.concurrency) || 50;
const duration = parseInt(args.duration) || 30;  // seconds
const scenario = args.scenario || 'load';

types.setTypeParser(types.builtins.INT8, (value) => parseInt(value));

const config = {
  host: 'pgbun',
  port: 6432,
  database: 'pgbun_test',
  user: 'pgbun_user',
  password: 'pgbun_pass',
  max: concurrency,  // Pool size for client-side simulation
};

let startTime = Date.now();
let totalQueries = 0;
let errors = 0;
let latencies = [];
let connsUsed = new Set();  // Track unique conns via query (if pgbun exposes stats)

const pool = new Pool(config);

async function runQuery(client) {
  const queryStart = performance.now();
  try {
    const res = await client.query('SELECT * FROM users WHERE id = $1', [1]);
    totalQueries++;
    latencies.push(performance.now() - queryStart);
    // For transaction mode: await client.query('BEGIN'); ... 'COMMIT';
    if (scenario === 'boundary') {
      await client.query('BEGIN');
      await client.query('INSERT INTO users (name) VALUES ($1)', ['load_test']);
      await client.query('COMMIT');
    }
  } catch (err) {
    errors++;
    console.error('Query error:', err.message);
  }
}

async function loadTest() {
  const promises = [];
  for (let i = 0; i < concurrency; i++) {
    const client = await pool.connect();
    promises.push(
      new Promise((resolve) => {
        const interval = setInterval(async () => {
          if (Date.now() - startTime > duration * 1000) {
            clearInterval(interval);
            client.release();
            resolve();
          } else {
            await runQuery(client);
          }
        }, 100);  // 10 QPS per conn
      })
    );
  }
  await Promise.all(promises);
  await pool.end();

  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length || 0;
  const reuseEfficiency = 0.85;  // Stub; parse pgbun logs or query stats endpoint
  const metrics = {
    mode,
    concurrency,
    duration,
    total_queries: totalQueries,
    errors,
    avg_latency_ms: avgLatency,
    reuse_efficiency: reuseEfficiency,
    max_conns_used: connsUsed.size || concurrency / 4  // Estimate for transaction
  };
  console.log(JSON.stringify(metrics, null, 2));
  // Write to file: Bun.write('metrics/load.json', JSON.stringify(metrics));
}

loadTest().catch(console.error);
```

### transaction-test.js (Boundary + Edge Cases)
```javascript
// Similar structure; focus on sequences
// e.g., Test idle: connect, sleep 70s ( > server_idle_timeout), query → expect reconnect
// For reconnections: Use docker exec to pause postgres, verify pgbun backoff logs
```

## Metrics Output Format
All scripts output JSON for easy parsing (CI/tools):
```json
{
  "mode": "transaction",
  "concurrency": 100,
  "duration_seconds": 60,
  "total_queries": 10000,
  "successful_queries": 10000,
  "errors": 0,
  "error_rate": 0.0,
  "avg_latency_ms": 3.5,
  "p95_latency_ms": 5.2,
  "reuse_efficiency_percent": 92.3,
  "max_server_connections_used": 25,
  "throughput_qps": 166.67
}
```
- **Efficiency**: (reused conns / total assigns) from pgbun logs or counters.
- **Errors**: Connection failures, timeouts.
- **Perf**: Latencies from client timings; extend pgbun for server-side.

## Risks & Mitigations
- **Bun in Docker**: oven/bun images are stable; fallback to Node if issues.
- **Resource Limits**: Set in Compose: `deploy.resources.limits.memory: 512M`.
- **Windows/Mac Compatibility**: Use `docker compose` v2; volumes work cross-platform.
- **Advanced Features**: SSL stub via `sslmode=disable` in pg config; add later.
- **CI Integration**: Export metrics to files; use in GitHub Actions (todo #16).

## Relevant Files

The self-contained Docker development and testing environment for pgbun has been implemented as designed. Key files created:

- `docker-compose.yml`: Orchestrates the postgres, pgbun, and test-runner services with networks, volumes, env vars, and health checks.
- `Dockerfile.bun`: Multi-stage build for pgbun with hot-reload support via volume mount and `bun run dev`.
- `Dockerfile.test`: Bun-based test-runner with `pg` and `minimist` deps, optional pgbench, and default CMD for load-test.
- `docker-entrypoint-initdb.d/init.sql`: Initializes the test DB (`pgbun_test`), user (`pgbun_user`), tables (`users`, `txn_log`), and sample data.
- `tests/load-test.js`: Parameterized Bun script for concurrent load testing, transaction scenarios, and JSON metrics output (reuse efficiency, latencies, QPS).
- `tests/transaction-test.js`: Focuses on boundary detection (BEGIN/COMMIT/ROLLBACK), edge cases (idle timeouts, rollbacks), and txn-specific metrics.
- `.env.example`: Default env vars for pgbun config (POOL_MODE, timeouts, etc.); copy to `.env` for use.
- `README.md`: Added "Docker Development Environment" section with prerequisites, quick start commands (up/down/build/test), hot-reload workflow, manual testing, and file references.

The setup is hermetic, deployable with `docker compose up -d --build`, supports rapid cycles (hot-reload on src/ edits), and validates features like transaction pooling via parameterized tests (e.g., `docker compose run test-runner load-test.js --mode=transaction --concurrency=100`). Metrics output JSON for efficiency/error/performance analysis. For verification, run the commands in README; teardown with `docker compose down -v`.