# pgbun TLS/SSL Configuration

## Overview

pgbun supports SSL/TLS encryption for both client and server connections, providing secure communication between clients, pgbun, and PostgreSQL servers. The implementation supports multiple TLS modes and certificate-based authentication.

## TLS Modes

### Client TLS Modes

pgbun supports the following TLS modes for client connections:

- **`disable`**: SSL/TLS is disabled (default)
- **`allow`**: SSL/TLS is optional, fallback to plain connection if SSL fails
- **`prefer`**: SSL/TLS is preferred, fallback to plain connection if SSL fails
- **`require`**: SSL/TLS is required, reject connections without SSL
- **`verify-ca`**: SSL/TLS is required and server certificate must be verified against CA
- **`verify-full`**: SSL/TLS is required and server certificate must be verified against CA with hostname check

### Server TLS Modes

For connections to PostgreSQL servers, pgbun supports:

- **`disable`**: SSL/TLS is disabled
- **`allow`**: SSL/TLS is optional, fallback to plain connection if SSL fails
- **`prefer`**: SSL/TLS is preferred, fallback to plain connection if SSL fails (default)
- **`require`**: SSL/TLS is required, reject connections without SSL
- **`verify-ca`**: SSL/TLS is required and server certificate must be verified against CA
- **`verify-full`**: SSL/TLS is required and server certificate must be verified against CA with hostname check

## Configuration

### Command Line

```bash
# Enable client TLS
pgbun --client-tls-mode require

# Enable server TLS with certificate files
pgbun --server-tls-mode verify-ca --server-tls-ca-file /path/to/ca.crt

# Full TLS configuration
pgbun \
  --client-tls-mode require \
  --client-tls-key-file /path/to/client.key \
  --client-tls-cert-file /path/to/client.crt \
  --server-tls-mode prefer \
  --server-tls-ca-file /path/to/ca.crt
```

### Configuration File

```toml
[tls]
# Client TLS settings
client_tls_mode = "require"
client_tls_key_file = "/path/to/client.key"
client_tls_cert_file = "/path/to/client.crt"
client_tls_ca_file = "/path/to/ca.crt"

# Server TLS settings
server_tls_mode = "prefer"
server_tls_key_file = "/path/to/server.key"
server_tls_cert_file = "/path/to/server.crt"
server_tls_ca_file = "/path/to/ca.crt"
```

### Environment Variables

```bash
export PGBUN_CLIENT_TLS_MODE=require
export PGBUN_CLIENT_TLS_KEY_FILE=/path/to/client.key
export PGBUN_CLIENT_TLS_CERT_FILE=/path/to/client.crt
export PGBUN_CLIENT_TLS_CA_FILE=/path/to/ca.crt
export PGBUN_SERVER_TLS_MODE=prefer
export PGBUN_SERVER_TLS_CA_FILE=/path/to/ca.crt
```

## Certificate Files

### Client Certificates

When `client_tls_mode` is set to `require`, `verify-ca`, or `verify-full`, you must provide:

- **`client_tls_key_file`**: Private key file (PEM format)
- **`client_tls_cert_file`**: Certificate file (PEM format)
- **`client_tls_ca_file`**: CA certificate file (PEM format, required for verify modes)

### Server Certificates

When `server_tls_mode` is set to `require`, `verify-ca`, or `verify-full`, you must provide:

- **`server_tls_ca_file`**: CA certificate file (PEM format)
- **`server_tls_key_file`**: Private key file (PEM format, optional)
- **`server_tls_cert_file`**: Certificate file (PEM format, optional)

## SSL Request Protocol

pgbun implements the PostgreSQL SSL request protocol:

1. **Client connects** to pgbun
2. **Client sends SSL request** (if TLS is enabled)
3. **pgbun responds** with 'S' (SSL allowed) or 'N' (SSL denied)
4. **TLS handshake** occurs if SSL is allowed
5. **Regular PostgreSQL protocol** continues over encrypted connection

## Examples

### Basic TLS Setup

```bash
# Enable TLS for both client and server connections
pgbun \
  --client-tls-mode prefer \
  --server-tls-mode prefer \
  --server-tls-ca-file /etc/ssl/certs/ca-certificates.crt
```

### Production TLS Configuration

```toml
[tls]
# Require TLS for client connections
client_tls_mode = "require"
client_tls_key_file = "/etc/pgbun/client.key"
client_tls_cert_file = "/etc/pgbun/client.crt"
client_tls_ca_file = "/etc/pgbun/ca.crt"

# Prefer TLS for server connections
server_tls_mode = "prefer"
server_tls_ca_file = "/etc/pgbun/ca.crt"
```

### Development with Self-Signed Certificates

```bash
# Generate self-signed certificates
openssl req -x509 -newkey rsa:4096 -keyout client.key -out client.crt -days 365 -nodes
openssl req -x509 -newkey rsa:4096 -keyout server.key -out server.crt -days 365 -nodes

# Configure pgbun with self-signed certificates
pgbun \
  --client-tls-mode require \
  --client-tls-key-file client.key \
  --client-tls-cert-file client.crt \
  --server-tls-mode prefer \
  --server-tls-ca-file server.crt
```

## Client Connection Examples

### psql with TLS

```bash
# Connect with TLS
psql "host=localhost port=6432 dbname=mydb user=myuser sslmode=require"

# Connect with TLS and client certificate
psql "host=localhost port=6432 dbname=mydb user=myuser sslmode=require sslcert=client.crt sslkey=client.key sslrootcert=ca.crt"
```

### Node.js with TLS

```javascript
const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 6432,
  database: 'mydb',
  user: 'myuser',
  ssl: {
    rejectUnauthorized: true,
    ca: fs.readFileSync('ca.crt'),
    cert: fs.readFileSync('client.crt'),
    key: fs.readFileSync('client.key')
  }
});
```

### Python with TLS

```python
import psycopg2
import ssl

conn = psycopg2.connect(
    host='localhost',
    port=6432,
    database='mydb',
    user='myuser',
    sslmode='require',
    sslcert='client.crt',
    sslkey='client.key',
    sslrootcert='ca.crt'
)
```

## Troubleshooting

### Common Issues

1. **Certificate not found**
   ```
   Error: TLS mode is enabled, but key/cert files are not configured.
   ```
   **Solution**: Ensure certificate files exist and paths are correct.

2. **SSL handshake failed**
   ```
   Error: Failed to upgrade to TLS
   ```
   **Solution**: Check certificate validity and compatibility.

3. **CA verification failed**
   ```
   Error: Server certificate verification failed
   ```
   **Solution**: Ensure CA certificate is correct and server certificate is signed by the CA.

### Debugging

Enable verbose logging to troubleshoot TLS issues:

```bash
pgbun --verbose --client-tls-mode require
```

### Certificate Validation

Test certificate validity:

```bash
# Check certificate
openssl x509 -in client.crt -text -noout

# Verify certificate chain
openssl verify -CAfile ca.crt client.crt

# Test TLS connection
openssl s_client -connect localhost:6432 -cert client.crt -key client.key -CAfile ca.crt
```

## Security Considerations

1. **Certificate Management**: Store private keys securely and use proper file permissions (600)
2. **CA Validation**: Use `verify-ca` or `verify-full` in production environments
3. **Certificate Rotation**: Implement certificate rotation procedures
4. **Network Security**: TLS provides encryption but consider additional network security measures
5. **Key Storage**: Consider using hardware security modules (HSMs) for key storage in high-security environments

## Performance Impact

TLS adds computational overhead:

- **CPU**: Encryption/decryption operations
- **Memory**: TLS session state
- **Latency**: Additional handshake round-trips

For high-performance scenarios, consider:
- Using `prefer` mode to allow fallback to plain connections
- Monitoring TLS performance metrics
- Using hardware acceleration when available

## Compatibility

pgbun TLS implementation is compatible with:
- PostgreSQL 12+ (SSL support)
- Standard PostgreSQL clients (psql, libpq, etc.)
- Popular database drivers (Node.js pg, Python psycopg2, etc.)
- Standard TLS 1.2+ protocols