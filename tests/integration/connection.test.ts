import { test, expect } from "bun:test";
import { Client } from "pg";

test("connection via pgbun proxy", async () => {
  const client = new Client({
    host: "localhost",
    port: 6432, // pgbun proxy port
    user: "postgres",
    database: "postgres",
    password: "postgres",
  });

  try {
    await client.connect();
    const result = await client.query("SELECT 1 as test");
    expect(result.rows[0].test).toBe(1);
  } finally {
    await client.end();
  }
}, 10000);