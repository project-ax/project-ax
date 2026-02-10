// src/cli/index.ts
export interface CommandHandlers {
  serve?: () => Promise<void>;
  chat?: () => Promise<void>;
  send?: (args: string[]) => Promise<void>;
  configure?: () => Promise<void>;
  help?: () => Promise<void>;
}

export async function routeCommand(
  args: string[],
  handlers: CommandHandlers,
): Promise<void> {
  const command = args[0] || 'serve';

  switch (command) {
    case 'serve':
      if (handlers.serve) await handlers.serve();
      break;
    case 'chat':
      if (handlers.chat) await handlers.chat();
      break;
    case 'send':
      if (handlers.send) await handlers.send(args.slice(1));
      break;
    case 'configure':
      if (handlers.configure) await handlers.configure();
      break;
    default:
      if (handlers.help) await handlers.help();
      break;
  }
}

export function showHelp(): void {
  console.log(`
AX - Security-first personal AI agent

Usage:
  ax serve [options]     Start the AX server (default)
  ax chat [options]      Start interactive chat client
  ax send <message>      Send a single message
  ax configure           Run configuration wizard

Server Options:
  --daemon               Run server in background
  --socket <path>        Unix socket path (default: ~/.ax/ax.sock)
  --config <path>        Config file path (default: ~/.ax/ax.yaml)

Chat Options:
  --socket <path>        Unix socket path (default: ~/.ax/ax.sock)
  --no-stream            Disable streaming responses

Send Options:
  --socket <path>        Unix socket path (default: ~/.ax/ax.sock)
  --stdin, -             Read message from stdin
  --no-stream            Wait for full response
  --json                 Output full OpenAI JSON response

Examples:
  ax serve --daemon
  ax chat
  ax send "what is the capital of France"
  echo "summarize this" | ax send --stdin
  `);
}
