#!/usr/bin/env bun

import { Server } from "./server";
import { Config } from "./config";
import { CLIParser, CLIOptions } from "./cli";

async function main() {
  try {
    const cliOptions = CLIParser.parse();
    
    // Handle help and version commands
    if (cliOptions.help || cliOptions.command === 'help') {
      CLIParser.showHelp();
      process.exit(0);
    }
    
    if (cliOptions.version || cliOptions.command === 'version') {
      CLIParser.showVersion();
      process.exit(0);
    }
    
    // Load configuration with CLI overrides
    const config = Config.load(cliOptions);
    
    // Handle config command
    if (cliOptions.command === 'config') {
      config.showConfig();
      process.exit(0);
    }
    
    // Handle dry-run
    if (cliOptions.dryRun) {
      console.log('Configuration validation successful!');
      config.showConfig();
      process.exit(0);
    }
    
    // Start the server
    const server = new Server(config);
    
    // Set up logging level based on CLI options
    if (cliOptions.verbose) {
      console.log('Starting pgbun in verbose mode...');
      config.showConfig();
    } else if (!cliOptions.quiet) {
      console.log(`pgbun ${CLIParser.getVersion()} starting...`);
      console.log(`Listening on ${config.listenHost}:${config.listenPort}`);
      console.log(`Proxying to ${config.serverHost}:${config.serverPort}`);
    }
    
    await server.start();
    
    if (!cliOptions.quiet) {
      console.log(`Server started successfully! Pool mode: ${config.poolMode}`);
    }
    
    // Handle daemon mode
    if (cliOptions.daemon) {
      // Detach from terminal (simplified daemon mode)
      if (cliOptions.pidFile) {
        const fs = require('fs');
        fs.writeFileSync(cliOptions.pidFile, process.pid.toString());
      }
    }
    
    // Set up graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      if (!cliOptions.quiet) {
        console.log(`\nReceived ${signal}. Shutting down gracefully...`);
      }
      try {
        await server.stop();
        if (cliOptions.pidFile) {
          const fs = require('fs');
          try {
            fs.unlinkSync(cliOptions.pidFile);
          } catch (error) {
            // Ignore errors when removing PID file
          }
        }
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };
    
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Unknown option') || 
          error.message.includes('Invalid') || 
          error.message.includes('requires a value')) {
        console.error(`Error: ${error.message}`);
        console.error('\nUse --help for usage information.');
        process.exit(1);
      }
    }
    throw error;
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});