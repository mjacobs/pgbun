#!/usr/bin/env node

const { Client } = require('pg');

async function testConnection() {
  const client = new Client({
    host: 'localhost',
    port: 6432, // pgbun proxy port
    user: 'postgres',
    database: 'postgres',
    password: 'postgres'
  });

  try {
    console.log('Connecting to pgbun proxy...');
    await client.connect();
    console.log('Connected successfully!');

    console.log('Running test query: SELECT 1');
    const result = await client.query('SELECT 1 as test');
    console.log('Query result:', result.rows);

    console.log('Running test query: SELECT version()');
    const versionResult = await client.query('SELECT version()');
    console.log('PostgreSQL version:', versionResult.rows[0].version);

  } catch (error) {
    console.error('Connection test failed:', error.message);
  } finally {
    await client.end();
    console.log('Connection closed.');
  }
}

testConnection();