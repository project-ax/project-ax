// src/cli/utils/commands.ts

export interface CommandDef {
  name: string;
  description: string;
}

export const COMMANDS: CommandDef[] = [
  { name: 'quit', description: 'Exit the chat' },
  { name: 'clear', description: 'Clear message history' },
  { name: 'help', description: 'Show available commands' },
];

export type ParsedInput =
  | { type: 'message'; content: string }
  | { type: 'command'; name: string; args: string }
  | { type: 'empty' };

export function parseInput(raw: string): ParsedInput {
  const trimmed = raw.trim();
  if (!trimmed) return { type: 'empty' };

  if (trimmed.startsWith('/')) {
    const spaceIdx = trimmed.indexOf(' ', 1);
    if (spaceIdx === -1) {
      return { type: 'command', name: trimmed.slice(1), args: '' };
    }
    return {
      type: 'command',
      name: trimmed.slice(1, spaceIdx),
      args: trimmed.slice(spaceIdx + 1).trim(),
    };
  }

  return { type: 'message', content: trimmed };
}

export function isKnownCommand(name: string): boolean {
  return COMMANDS.some(c => c.name === name);
}

export function formatHelp(): string {
  const lines = COMMANDS.map(c => `  /${c.name} — ${c.description}`);
  return 'Available commands:\n' + lines.join('\n');
}
