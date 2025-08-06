#!/usr/bin/env bun

import { Server } from "./server";
import { Config } from "./config";

async function main() {
  const config = Config.load();
  const server = new Server(config);
  
  await server.start();
  
  process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nShutting down gracefully...');
    await server.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});