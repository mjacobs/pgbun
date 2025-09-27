export interface CLIOptions {
  help?: boolean;
  version?: boolean;
  command?: 'start' | 'config' | 'version' | 'help';
  
  // Connection options
  listenPort?: number;
  listenHost?: string;
  serverHost?: string;
  serverPort?: number;
  
  // Pool options
  poolMode?: 'session' | 'transaction' | 'statement';
  maxClientConn?: number;
  poolSize?: number;
  
  // Config options
  config?: string;
  env?: string;
  dryRun?: boolean;
  
  // Logging options
  verbose?: boolean;
  quiet?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  logConnections?: boolean;
  statsPeriod?: number;
  
  // Operational options
  daemon?: boolean;
  pidFile?: string;
}

export class CLIParser {
  static parse(args: string[] = Bun.argv.slice(2)): CLIOptions {
    const options: CLIOptions = {};
    let i = 0;

    while (i < args.length) {
      const arg = args[i];
      const nextArg = args[i + 1];

      switch (arg) {
        case '-h':
        case '--help':
          options.help = true;
          break;

        case '-V':
        case '--version':
          options.version = true;
          break;

        case '-p':
        case '--listen-port':
          if (!nextArg || isNaN(Number(nextArg))) {
            throw new Error(`Invalid port value: ${nextArg}`);
          }
          options.listenPort = Number(nextArg);
          i++;
          break;

        case '--listen-host':
          if (!nextArg) {
            throw new Error('--listen-host requires a value');
          }
          options.listenHost = nextArg;
          i++;
          break;

        case '--server-host':
          if (!nextArg) {
            throw new Error('--server-host requires a value');
          }
          options.serverHost = nextArg;
          i++;
          break;

        case '--server-port':
          if (!nextArg || isNaN(Number(nextArg))) {
            throw new Error(`Invalid server port value: ${nextArg}`);
          }
          options.serverPort = Number(nextArg);
          i++;
          break;

        case '--pool-mode':
          if (!nextArg || !['session', 'transaction', 'statement'].includes(nextArg)) {
            throw new Error(`Invalid pool mode '${nextArg}'. Must be one of: session, transaction, statement`);
          }
          options.poolMode = nextArg as 'session' | 'transaction' | 'statement';
          i++;
          break;

        case '--max-client-conn':
          if (!nextArg || isNaN(Number(nextArg))) {
            throw new Error(`Invalid max client connections value: ${nextArg}`);
          }
          options.maxClientConn = Number(nextArg);
          i++;
          break;

        case '--pool-size':
          if (!nextArg || isNaN(Number(nextArg))) {
            throw new Error(`Invalid pool size value: ${nextArg}`);
          }
          options.poolSize = Number(nextArg);
          i++;
          break;

        case '-c':
        case '--config':
          if (!nextArg) {
            throw new Error('--config requires a file path');
          }
          options.config = nextArg;
          i++;
          break;

        case '--env':
          if (!nextArg || !['dev', 'prod', 'test'].includes(nextArg)) {
            throw new Error(`Invalid environment '${nextArg}'. Must be one of: dev, prod, test`);
          }
          options.env = nextArg;
          i++;
          break;

        case '--dry-run':
          options.dryRun = true;
          break;

        case '-v':
        case '--verbose':
          options.verbose = true;
          break;

        case '-q':
        case '--quiet':
          options.quiet = true;
          break;

        case '--log-level':
          if (!nextArg || !['debug', 'info', 'warn', 'error'].includes(nextArg)) {
            throw new Error(`Invalid log level '${nextArg}'. Must be one of: debug, info, warn, error`);
          }
          options.logLevel = nextArg as 'debug' | 'info' | 'warn' | 'error';
          i++;
          break;

        case '--log-connections':
          options.logConnections = true;
          break;

        case '--stats-period':
          if (!nextArg || isNaN(Number(nextArg))) {
            throw new Error(`Invalid stats period value: ${nextArg}`);
          }
          options.statsPeriod = Number(nextArg);
          i++;
          break;

        case '-d':
        case '--daemon':
          options.daemon = true;
          break;

        case '--pid-file':
          if (!nextArg) {
            throw new Error('--pid-file requires a file path');
          }
          options.pidFile = nextArg;
          i++;
          break;

        default:
          // Handle commands
          if (!arg.startsWith('-')) {
            if (['start', 'config', 'version', 'help'].includes(arg)) {
              options.command = arg as 'start' | 'config' | 'version' | 'help';
            } else {
              throw new Error(`Unknown command: ${arg}`);
            }
          } else {
            throw new Error(`Unknown option: ${arg}`);
          }
          break;
      }
      i++;
    }

    // Set default command
    if (!options.command && !options.help && !options.version) {
      options.command = 'start';
    }

    // Validate port ranges
    if (options.listenPort && (options.listenPort < 1 || options.listenPort > 65535)) {
      throw new Error(`Invalid listen port '${options.listenPort}'. Must be between 1 and 65535`);
    }
    if (options.serverPort && (options.serverPort < 1 || options.serverPort > 65535)) {
      throw new Error(`Invalid server port '${options.serverPort}'. Must be between 1 and 65535`);
    }

    return options;
  }

  static getVersion(): string {
    try {
      const packageJson = require('../package.json');
      return packageJson.version || '0.1.0';
    } catch {
      return '0.1.0';
    }
  }

  static showHelp(): void {
    const version = this.getVersion();
    console.log(`pgbun ${version} - PostgreSQL Connection Pool and Proxy

USAGE:
    pgbun [OPTIONS] [COMMAND]

COMMANDS:
    start      Start the connection pool server (default)
    config     Show current configuration
    version    Show version information
    help       Show help information

CONNECTION OPTIONS:
    -p, --listen-port <PORT>     Listen port [default: 6432]
        --listen-host <HOST>     Listen host [default: 0.0.0.0]
        --server-host <HOST>     PostgreSQL server host [default: localhost]
        --server-port <PORT>     PostgreSQL server port [default: 5432]

POOL OPTIONS:
    --pool-mode <MODE>           Pool mode: session|transaction|statement [default: session]
    --max-client-conn <NUM>      Maximum client connections [default: 100]
    --pool-size <NUM>            Default pool size [default: 25]

CONFIG OPTIONS:
    -c, --config <FILE>          Configuration file path
        --env <ENV>              Environment: dev|prod|test
        --dry-run                Validate configuration without starting

LOGGING OPTIONS:
    -v, --verbose                Verbose logging
    -q, --quiet                  Suppress non-error output
        --log-level <LEVEL>      Log level: debug|info|warn|error [default: info]
        --log-connections        Log connection events
        --stats-period <MS>      Statistics reporting interval [default: 60000]

OTHER OPTIONS:
    -d, --daemon                 Run as daemon
        --pid-file <FILE>        Write PID to file
    -h, --help                   Show this help message
    -V, --version                Show version information

EXAMPLES:
    pgbun                                    # Start with defaults
    pgbun -p 6433 --pool-mode transaction   # Custom port and pool mode
    pgbun --config /etc/pgbun.conf          # Use config file
    pgbun config                             # Show current configuration

ENVIRONMENT VARIABLES:
    PGBUN_LISTEN_PORT            Override listen port
    PGBUN_LISTEN_HOST            Override listen host
    PGBUN_SERVER_HOST            Override server host
    PGBUN_SERVER_PORT            Override server port
    PGBUN_POOL_MODE              Override pool mode
    PGBUN_LOG_LEVEL              Override log level`);
  }

  static showVersion(): void {
    console.log(`pgbun ${this.getVersion()}`);
  }
}