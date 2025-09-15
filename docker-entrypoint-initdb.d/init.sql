-- Initialize test database and user for pgbun
-- This script runs automatically on PostgreSQL container startup

-- Enable plpgsql extension if not already
CREATE EXTENSION IF NOT EXISTS plpgsql;

-- Connect to the test database (set via POSTGRES_DB env)
\c pgbun_test;

-- Grant privileges to the test user (set via POSTGRES_USER env)
GRANT ALL PRIVILEGES ON DATABASE pgbun_test TO pgbun_user;

-- Create test table for load and transaction testing
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  email VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial sample data
INSERT INTO users (name, email) VALUES 
  ('test_user1', 'user1@example.com'),
  ('test_user2', 'user2@example.com'),
  ('load_test_user', 'load@example.com')
ON CONFLICT (id) DO NOTHING;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_users_name ON users (name);

-- For transaction boundary tests: a simple log table to track inserts within txns
CREATE TABLE IF NOT EXISTS txn_log (
  id SERIAL PRIMARY KEY,
  action VARCHAR(20) NOT NULL,
  details TEXT,
  logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Grant privileges on tables
GRANT ALL ON TABLE users TO pgbun_user;
GRANT ALL ON TABLE txn_log TO pgbun_user;
GRANT USAGE, SELECT ON SEQUENCE users_id_seq TO pgbun_user;
GRANT USAGE, SELECT ON SEQUENCE txn_log_id_seq TO pgbun_user;