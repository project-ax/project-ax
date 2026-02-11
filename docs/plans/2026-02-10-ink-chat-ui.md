# Ink Chat UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the readline-based chat client (`src/cli/chat.ts`) with a rich terminal UI using Ink (React for CLIs), providing streaming responses, scrollable message history, markdown rendering, and slash commands.

**Architecture:** Ink renders React components to the terminal. The `App` root component manages state (messages, loading, connection status) and delegates to child components for rendering. Server communication is unchanged — Unix socket fetch to `/v1/chat/completions` with SSE streaming. Pure utility functions handle markdown rendering and command parsing.

**Tech Stack:** Ink 5, React 18, ink-text-input 6, ink-spinner 5, marked 11, chalk 5, highlight.js 11

---

## Current State

- `src/cli/chat.ts` (197 LOC) — readline-based client with `createChatClient()` and `runChat()`
- `tests/cli/chat.test.ts` (167 LOC) — 4 tests using mock stdin/stdout/fetch
- `src/cli/index.ts` — routes `ax chat` to `runChat()` via dynamic import
- `tsconfig.json` — no JSX support configured
- Project uses ESM (`"type": "module"`), TypeScript 5.9, Node 24+

## File Plan

```
Create:
  src/cli/utils/markdown.ts       — Markdown → ANSI string conversion
  src/cli/utils/commands.ts        — Slash command parser & handlers
  src/cli/components/App.tsx       — Root component, state, data flow
  src/cli/components/StatusBar.tsx  — Connection status + model name
  src/cli/components/MessageList.tsx — Scrollable message area
  src/cli/components/Message.tsx    — Individual message with colored border
  src/cli/components/InputBox.tsx   — Text input + submit handling
  src/cli/components/ThinkingIndicator.tsx — Loading spinner
  tests/cli/utils/markdown.test.ts  — Markdown renderer tests
  tests/cli/utils/commands.test.ts  — Command parser tests
  tests/cli/components/App.test.tsx — Full app integration tests

Modify:
  tsconfig.json                    — Add jsx: "react-jsx"
  package.json                     — Add ink, react, marked, etc.
  src/cli/chat.ts                  — Replace readline with Ink render()
  tests/cli/chat.test.ts           — Update for new architecture
```

---

### Task 1: Add Dependencies & Configure JSX

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`

**Step 1: Install dependencies**

Run:
```bash
npm install ink@^5.0.0 ink-text-input@^6.0.0 ink-spinner@^5.0.0 react@^18.3.1 marked@^11.0.0 chalk@^5.3.0 highlight.js@^11.9.0
```

**Step 2: Install dev dependencies for testing**

Run:
```bash
npm install --save-dev ink-testing-library@^4.0.0 @types/react@^18.3.0
```

**Step 3: Add JSX support to tsconfig.json**

In `tsconfig.json`, add `"jsx": "react-jsx"` to `compilerOptions`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "jsx": "react-jsx"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 4: Verify build still works**

Run: `npm run build`
Expected: Clean compilation, no errors

**Step 5: Verify tests still pass**

Run: `npm test`
Expected: All existing tests pass (592+)

**Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json
git commit -m "chore: add ink, react, marked dependencies and JSX support"
```

---

### Task 2: Markdown Renderer

**Files:**
- Create: `src/cli/utils/markdown.ts`
- Create: `tests/cli/utils/markdown.test.ts`

**Step 1: Write the failing tests**

Create `tests/cli/utils/markdown.test.ts`:

```typescript
// tests/cli/utils/markdown.test.ts
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../../src/cli/utils/markdown.js';

describe('renderMarkdown', () => {
  it('should render plain text unchanged', () => {
    const result = renderMarkdown('Hello world');
    expect(result).toContain('Hello world');
  });

  it('should render bold text', () => {
    const result = renderMarkdown('This is **bold** text');
    // chalk.bold wraps in ANSI bold escape codes
    expect(result).toContain('\x1b[1m');
    expect(result).toContain('bold');
  });

  it('should render italic text', () => {
    const result = renderMarkdown('This is *italic* text');
    expect(result).toContain('\x1b[3m');
    expect(result).toContain('italic');
  });

  it('should render inline code', () => {
    const result = renderMarkdown('Use `console.log()` here');
    expect(result).toContain('console.log()');
  });

  it('should render code blocks with language', () => {
    const result = renderMarkdown('```javascript\nconst x = 1;\n```');
    expect(result).toContain('const');
    expect(result).toContain('x');
  });

  it('should render code blocks without language', () => {
    const result = renderMarkdown('```\nsome code\n```');
    expect(result).toContain('some code');
  });

  it('should render headers', () => {
    const result = renderMarkdown('# Header 1');
    // Should be bold + colored
    expect(result).toContain('\x1b[1m');
    expect(result).toContain('Header 1');
  });

  it('should render unordered lists', () => {
    const result = renderMarkdown('- item 1\n- item 2');
    expect(result).toContain('item 1');
    expect(result).toContain('item 2');
  });

  it('should render links with URL', () => {
    const result = renderMarkdown('[Click here](https://example.com)');
    expect(result).toContain('Click here');
    expect(result).toContain('https://example.com');
  });

  it('should handle empty input', () => {
    const result = renderMarkdown('');
    expect(result).toBe('');
  });

  it('should handle multi-paragraph text', () => {
    const result = renderMarkdown('Paragraph 1\n\nParagraph 2');
    expect(result).toContain('Paragraph 1');
    expect(result).toContain('Paragraph 2');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/cli/utils/markdown.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the markdown renderer**

Create `src/cli/utils/markdown.ts`:

```typescript
// src/cli/utils/markdown.ts
import chalk from 'chalk';
import { Marked } from 'marked';
import hljs from 'highlight.js';

const marked = new Marked();

// Map highlight.js token classes to chalk styles
function hljsToChalk(html: string): string {
  return html
    // Remove HTML tags but apply chalk for known hljs classes
    .replace(/<span class="hljs-keyword">(.*?)<\/span>/g, (_, t) => chalk.magenta(t))
    .replace(/<span class="hljs-string">(.*?)<\/span>/g, (_, t) => chalk.green(t))
    .replace(/<span class="hljs-number">(.*?)<\/span>/g, (_, t) => chalk.yellow(t))
    .replace(/<span class="hljs-comment">(.*?)<\/span>/g, (_, t) => chalk.gray(t))
    .replace(/<span class="hljs-built_in">(.*?)<\/span>/g, (_, t) => chalk.cyan(t))
    .replace(/<span class="hljs-function">(.*?)<\/span>/g, (_, t) => chalk.blue(t))
    .replace(/<span class="hljs-title[^"]*">(.*?)<\/span>/g, (_, t) => chalk.blue(t))
    .replace(/<span class="hljs-params">(.*?)<\/span>/g, (_, t) => t)
    .replace(/<span class="hljs-literal">(.*?)<\/span>/g, (_, t) => chalk.yellow(t))
    .replace(/<span class="hljs-attr">(.*?)<\/span>/g, (_, t) => chalk.cyan(t))
    .replace(/<span class="hljs-[^"]*">(.*?)<\/span>/g, (_, t) => t)
    .replace(/<\/?[^>]+>/g, '') // Strip remaining HTML tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

const renderer: Record<string, (...args: any[]) => string> = {
  heading({ text, depth }: { text: string; depth: number }) {
    const prefix = '#'.repeat(depth) + ' ';
    return '\n' + chalk.bold.cyan(prefix + text) + '\n\n';
  },

  paragraph({ text }: { text: string }) {
    return text + '\n\n';
  },

  strong({ text }: { text: string }) {
    return chalk.bold(text);
  },

  em({ text }: { text: string }) {
    return chalk.italic(text);
  },

  codespan({ text }: { text: string }) {
    return chalk.gray.bgBlackBright(' ' + text + ' ');
  },

  code({ text, lang }: { text: string; lang?: string }) {
    let highlighted: string;
    if (lang && hljs.getLanguage(lang)) {
      const result = hljs.highlight(text, { language: lang });
      highlighted = hljsToChalk(result.value);
    } else {
      highlighted = text;
    }
    const border = chalk.gray('─'.repeat(40));
    const langLabel = lang ? chalk.gray(` ${lang} `) : '';
    return '\n' + border + langLabel + '\n' + highlighted + '\n' + border + '\n\n';
  },

  list({ body }: { body: string }) {
    return body + '\n';
  },

  listitem({ text }: { text: string }) {
    return '  ' + chalk.dim('•') + ' ' + text + '\n';
  },

  link({ href, text }: { href: string; text: string }) {
    return chalk.blue.underline(text) + chalk.gray(' (' + href + ')');
  },

  blockquote({ text }: { text: string }) {
    const lines = text.split('\n').map(l => chalk.gray('│ ') + chalk.italic(l));
    return lines.join('\n') + '\n';
  },

  hr() {
    return chalk.gray('─'.repeat(40)) + '\n\n';
  },
};

marked.use({ renderer });

export function renderMarkdown(content: string): string {
  if (!content) return '';
  const result = marked.parse(content) as string;
  // Trim trailing newlines
  return result.replace(/\n{3,}/g, '\n\n').trimEnd();
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/cli/utils/markdown.test.ts`
Expected: 11/11 PASS

**Step 5: Commit**

```bash
git add src/cli/utils/markdown.ts tests/cli/utils/markdown.test.ts
git commit -m "feat: add markdown-to-ANSI renderer for terminal chat UI"
```

---

### Task 3: Command Parser

**Files:**
- Create: `src/cli/utils/commands.ts`
- Create: `tests/cli/utils/commands.test.ts`

**Step 1: Write the failing tests**

Create `tests/cli/utils/commands.test.ts`:

```typescript
// tests/cli/utils/commands.test.ts
import { describe, it, expect } from 'vitest';
import { parseInput, COMMANDS } from '../../src/cli/utils/commands.js';

describe('parseInput', () => {
  it('should identify regular messages', () => {
    const result = parseInput('Hello world');
    expect(result).toEqual({ type: 'message', content: 'Hello world' });
  });

  it('should parse /quit command', () => {
    const result = parseInput('/quit');
    expect(result).toEqual({ type: 'command', name: 'quit', args: '' });
  });

  it('should parse /clear command', () => {
    const result = parseInput('/clear');
    expect(result).toEqual({ type: 'command', name: 'clear', args: '' });
  });

  it('should parse /help command', () => {
    const result = parseInput('/help');
    expect(result).toEqual({ type: 'command', name: 'help', args: '' });
  });

  it('should handle unknown commands', () => {
    const result = parseInput('/foo');
    expect(result).toEqual({ type: 'command', name: 'foo', args: '' });
  });

  it('should parse command arguments', () => {
    const result = parseInput('/model gpt-4');
    expect(result).toEqual({ type: 'command', name: 'model', args: 'gpt-4' });
  });

  it('should trim whitespace from messages', () => {
    const result = parseInput('  hello  ');
    expect(result).toEqual({ type: 'message', content: 'hello' });
  });

  it('should ignore empty input', () => {
    const result = parseInput('');
    expect(result).toEqual({ type: 'empty' });
  });

  it('should ignore whitespace-only input', () => {
    const result = parseInput('   ');
    expect(result).toEqual({ type: 'empty' });
  });

  it('should list known commands', () => {
    expect(COMMANDS).toContainEqual(expect.objectContaining({ name: 'quit' }));
    expect(COMMANDS).toContainEqual(expect.objectContaining({ name: 'clear' }));
    expect(COMMANDS).toContainEqual(expect.objectContaining({ name: 'help' }));
  });

  it('should check if a command is known', () => {
    const quit = parseInput('/quit');
    expect(quit.type === 'command' && COMMANDS.some(c => c.name === quit.name)).toBe(true);

    const unknown = parseInput('/foo');
    expect(unknown.type === 'command' && COMMANDS.some(c => c.name === unknown.name)).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/cli/utils/commands.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the command parser**

Create `src/cli/utils/commands.ts`:

```typescript
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
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/cli/utils/commands.test.ts`
Expected: 11/11 PASS

**Step 5: Commit**

```bash
git add src/cli/utils/commands.ts tests/cli/utils/commands.test.ts
git commit -m "feat: add slash command parser for chat UI"
```

---

### Task 4: Message Component

**Files:**
- Create: `src/cli/components/Message.tsx`

**Step 1: Write the failing test**

Add to a new test file `tests/cli/components/Message.test.tsx`:

```tsx
// tests/cli/components/Message.test.tsx
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { Message } from '../../../src/cli/components/Message.js';

describe('Message', () => {
  it('should render user message with "you" label', () => {
    const { lastFrame } = render(
      <Message role="user" content="Hello" type="normal" />
    );
    const frame = lastFrame();
    expect(frame).toContain('you');
    expect(frame).toContain('Hello');
  });

  it('should render assistant message with "agent" label', () => {
    const { lastFrame } = render(
      <Message role="assistant" content="Hi there" type="normal" />
    );
    const frame = lastFrame();
    expect(frame).toContain('agent');
    expect(frame).toContain('Hi there');
  });

  it('should render error messages', () => {
    const { lastFrame } = render(
      <Message role="system" content="Connection failed" type="error" />
    );
    const frame = lastFrame();
    expect(frame).toContain('error');
    expect(frame).toContain('Connection failed');
  });

  it('should render system messages', () => {
    const { lastFrame } = render(
      <Message role="system" content="Welcome" type="system" />
    );
    const frame = lastFrame();
    expect(frame).toContain('system');
    expect(frame).toContain('Welcome');
  });

  it('should render markdown for assistant messages', () => {
    const { lastFrame } = render(
      <Message role="assistant" content="Use **bold**" type="normal" />
    );
    const frame = lastFrame();
    // Should contain ANSI bold escape or the word bold
    expect(frame).toContain('bold');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/cli/components/Message.test.tsx`
Expected: FAIL — module not found

**Step 3: Implement Message component**

Create `src/cli/components/Message.tsx`:

```tsx
// src/cli/components/Message.tsx
import React from 'react';
import { Box, Text } from 'ink';
import { renderMarkdown } from '../utils/markdown.js';

export interface MessageProps {
  role: 'user' | 'assistant' | 'system' | 'error';
  content: string;
  type: 'normal' | 'error' | 'system';
}

const STYLE: Record<string, { borderColor: string; label: string }> = {
  user:      { borderColor: 'blue',   label: 'you' },
  assistant: { borderColor: 'green',  label: 'agent' },
  error:     { borderColor: 'red',    label: 'error' },
  system:    { borderColor: 'yellow', label: 'system' },
};

export function Message({ role, content, type }: MessageProps) {
  const effectiveRole = type === 'error' ? 'error' : type === 'system' ? 'system' : role;
  const style = STYLE[effectiveRole] ?? STYLE.system;

  // Render markdown for assistant messages, plain text for everything else
  const rendered = role === 'assistant' ? renderMarkdown(content) : content;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={style.borderColor}
      paddingX={1}
      marginBottom={1}
    >
      <Text bold color={style.borderColor}>{style.label}</Text>
      <Text>{rendered}</Text>
    </Box>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/cli/components/Message.test.tsx`
Expected: 5/5 PASS

**Step 5: Commit**

```bash
git add src/cli/components/Message.tsx tests/cli/components/Message.test.tsx
git commit -m "feat: add Message component with role-based styling and markdown"
```

---

### Task 5: StatusBar Component

**Files:**
- Create: `src/cli/components/StatusBar.tsx`

**Step 1: Write the failing test**

Add to `tests/cli/components/StatusBar.test.tsx`:

```tsx
// tests/cli/components/StatusBar.test.tsx
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { StatusBar } from '../../../src/cli/components/StatusBar.js';

describe('StatusBar', () => {
  it('should show connected status in green', () => {
    const { lastFrame } = render(
      <StatusBar status="connected" model="claude-sonnet-4-5-20250929" />
    );
    const frame = lastFrame();
    expect(frame).toContain('Connected');
    expect(frame).toContain('claude-sonnet-4-5-20250929');
  });

  it('should show disconnected status', () => {
    const { lastFrame } = render(
      <StatusBar status="disconnected" model="default" />
    );
    const frame = lastFrame();
    expect(frame).toContain('Disconnected');
  });

  it('should show connecting status', () => {
    const { lastFrame } = render(
      <StatusBar status="connecting" model="default" />
    );
    const frame = lastFrame();
    expect(frame).toContain('Connecting');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/cli/components/StatusBar.test.tsx`
Expected: FAIL — module not found

**Step 3: Implement StatusBar component**

Create `src/cli/components/StatusBar.tsx`:

```tsx
// src/cli/components/StatusBar.tsx
import React from 'react';
import { Box, Text } from 'ink';

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

export interface StatusBarProps {
  status: ConnectionStatus;
  model?: string;
}

const STATUS_DISPLAY: Record<ConnectionStatus, { symbol: string; color: string; label: string }> = {
  connected:    { symbol: '●', color: 'green', label: 'Connected' },
  disconnected: { symbol: '○', color: 'red',   label: 'Disconnected' },
  connecting:   { symbol: '○', color: 'gray',  label: 'Connecting...' },
};

export function StatusBar({ status, model }: StatusBarProps) {
  const s = STATUS_DISPLAY[status];
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} justifyContent="space-between">
      <Text>
        <Text color={s.color}>{s.symbol}</Text>
        {' '}
        <Text color={s.color}>{s.label}</Text>
      </Text>
      {model && <Text color="gray">{model}</Text>}
    </Box>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/cli/components/StatusBar.test.tsx`
Expected: 3/3 PASS

**Step 5: Commit**

```bash
git add src/cli/components/StatusBar.tsx tests/cli/components/StatusBar.test.tsx
git commit -m "feat: add StatusBar component with connection status indicator"
```

---

### Task 6: ThinkingIndicator Component

**Files:**
- Create: `src/cli/components/ThinkingIndicator.tsx`

**Step 1: Write the failing test**

Add to `tests/cli/components/ThinkingIndicator.test.tsx`:

```tsx
// tests/cli/components/ThinkingIndicator.test.tsx
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { ThinkingIndicator } from '../../../src/cli/components/ThinkingIndicator.js';

describe('ThinkingIndicator', () => {
  it('should show thinking text when visible', () => {
    const { lastFrame } = render(<ThinkingIndicator visible={true} />);
    expect(lastFrame()).toContain('thinking');
  });

  it('should render nothing when not visible', () => {
    const { lastFrame } = render(<ThinkingIndicator visible={false} />);
    // Empty or just whitespace
    expect(lastFrame()?.trim() ?? '').toBe('');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/cli/components/ThinkingIndicator.test.tsx`
Expected: FAIL — module not found

**Step 3: Implement ThinkingIndicator component**

Create `src/cli/components/ThinkingIndicator.tsx`:

```tsx
// src/cli/components/ThinkingIndicator.tsx
import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

export interface ThinkingIndicatorProps {
  visible: boolean;
}

export function ThinkingIndicator({ visible }: ThinkingIndicatorProps) {
  if (!visible) return null;
  return (
    <Box paddingX={1} marginBottom={1}>
      <Text color="green">
        <Spinner type="dots" />
      </Text>
      <Text color="gray"> thinking...</Text>
    </Box>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/cli/components/ThinkingIndicator.test.tsx`
Expected: 2/2 PASS

**Step 5: Commit**

```bash
git add src/cli/components/ThinkingIndicator.tsx tests/cli/components/ThinkingIndicator.test.tsx
git commit -m "feat: add ThinkingIndicator component with spinner"
```

---

### Task 7: InputBox Component

**Files:**
- Create: `src/cli/components/InputBox.tsx`

**Step 1: Write the failing test**

Add to `tests/cli/components/InputBox.test.tsx`:

```tsx
// tests/cli/components/InputBox.test.tsx
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { InputBox } from '../../../src/cli/components/InputBox.js';

describe('InputBox', () => {
  it('should render placeholder when empty', () => {
    const { lastFrame } = render(
      <InputBox onSubmit={() => {}} isDisabled={false} />
    );
    const frame = lastFrame();
    expect(frame).toContain('Type a message');
  });

  it('should show disabled state', () => {
    const { lastFrame } = render(
      <InputBox onSubmit={() => {}} isDisabled={true} />
    );
    // Disabled input should still render
    expect(lastFrame()).toBeDefined();
  });

  it('should call onSubmit when Enter is pressed', () => {
    const onSubmit = vi.fn();
    const { stdin } = render(
      <InputBox onSubmit={onSubmit} isDisabled={false} />
    );
    // Type text and press enter
    stdin.write('hello');
    stdin.write('\r');
    expect(onSubmit).toHaveBeenCalledWith('hello');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/cli/components/InputBox.test.tsx`
Expected: FAIL — module not found

**Step 3: Implement InputBox component**

Create `src/cli/components/InputBox.tsx`:

```tsx
// src/cli/components/InputBox.tsx
import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

export interface InputBoxProps {
  onSubmit: (value: string) => void;
  isDisabled: boolean;
}

export function InputBox({ onSubmit, isDisabled }: InputBoxProps) {
  const [value, setValue] = useState('');

  const handleSubmit = (submitted: string) => {
    if (!submitted.trim()) return;
    onSubmit(submitted);
    setValue('');
  };

  return (
    <Box borderStyle="single" borderColor={isDisabled ? 'gray' : 'blue'} paddingX={1}>
      <Text color="blue" bold>{'> '}</Text>
      {isDisabled ? (
        <Text color="gray">waiting for response...</Text>
      ) : (
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder="Type a message or /help for commands..."
        />
      )}
    </Box>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/cli/components/InputBox.test.tsx`
Expected: 3/3 PASS

**Step 5: Commit**

```bash
git add src/cli/components/InputBox.tsx tests/cli/components/InputBox.test.tsx
git commit -m "feat: add InputBox component with text input and submit"
```

---

### Task 8: MessageList Component

**Files:**
- Create: `src/cli/components/MessageList.tsx`

**Step 1: Write the failing test**

Add to `tests/cli/components/MessageList.test.tsx`:

```tsx
// tests/cli/components/MessageList.test.tsx
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { MessageList } from '../../../src/cli/components/MessageList.js';
import type { ChatMessage } from '../../../src/cli/components/MessageList.js';

describe('MessageList', () => {
  it('should render no messages when empty', () => {
    const { lastFrame } = render(<MessageList messages={[]} />);
    // Should render something but no message boxes
    expect(lastFrame()).toBeDefined();
  });

  it('should render multiple messages', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Hello', type: 'normal' },
      { role: 'assistant', content: 'Hi there', type: 'normal' },
    ];
    const { lastFrame } = render(<MessageList messages={messages} />);
    const frame = lastFrame();
    expect(frame).toContain('Hello');
    expect(frame).toContain('Hi there');
  });

  it('should render error messages', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'Something went wrong', type: 'error' },
    ];
    const { lastFrame } = render(<MessageList messages={messages} />);
    expect(lastFrame()).toContain('Something went wrong');
  });

  it('should render system messages', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'Welcome to AX', type: 'system' },
    ];
    const { lastFrame } = render(<MessageList messages={messages} />);
    expect(lastFrame()).toContain('Welcome to AX');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/cli/components/MessageList.test.tsx`
Expected: FAIL — module not found

**Step 3: Implement MessageList component**

Create `src/cli/components/MessageList.tsx`:

```tsx
// src/cli/components/MessageList.tsx
import React from 'react';
import { Box } from 'ink';
import { Message } from './Message.js';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'error';
  content: string;
  type: 'normal' | 'error' | 'system';
}

export interface MessageListProps {
  messages: ChatMessage[];
}

export function MessageList({ messages }: MessageListProps) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      {messages.map((msg, i) => (
        <Message
          key={i}
          role={msg.role}
          content={msg.content}
          type={msg.type}
        />
      ))}
    </Box>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/cli/components/MessageList.test.tsx`
Expected: 4/4 PASS

**Step 5: Commit**

```bash
git add src/cli/components/MessageList.tsx tests/cli/components/MessageList.test.tsx
git commit -m "feat: add MessageList component for rendering chat messages"
```

---

### Task 9: App Component — Root State & Data Flow

This is the largest task. The App component wires everything together: state management, server communication (via injected fetch), streaming response handling, slash commands, and error handling.

**Files:**
- Create: `src/cli/components/App.tsx`
- Create: `tests/cli/components/App.test.tsx`

**Step 1: Write the failing tests**

Create `tests/cli/components/App.test.tsx`:

```tsx
// tests/cli/components/App.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../../../src/cli/components/App.js';

function createMockSSEStream(content: string): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      const chunk = {
        choices: [{ delta: { content }, finish_reason: null }],
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('App', () => {
  it('should render status bar and input box on start', () => {
    const mockFetch = vi.fn();
    const { lastFrame } = render(
      <App fetchFn={mockFetch} sessionId="test-session" />
    );
    const frame = lastFrame();
    // Should show input area
    expect(frame).toContain('Type a message');
  });

  it('should send message on submit and show response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createMockSSEStream('Hello from agent'),
    });

    const { lastFrame, stdin } = render(
      <App fetchFn={mockFetch} sessionId="test-session" />
    );

    // Type and submit
    stdin.write('Hello\r');
    await wait(100);

    const frame = lastFrame();
    expect(frame).toContain('Hello');
    expect(frame).toContain('Hello from agent');
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('should handle /clear command', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createMockSSEStream('response'),
    });

    const { lastFrame, stdin } = render(
      <App fetchFn={mockFetch} sessionId="test-session" />
    );

    // Send a message first
    stdin.write('hello\r');
    await wait(100);

    // Clear
    stdin.write('/clear\r');
    await wait(50);

    const frame = lastFrame();
    // After clear, previous messages should be gone
    expect(frame).not.toContain('response');
  });

  it('should handle /help command', async () => {
    const { lastFrame, stdin } = render(
      <App fetchFn={vi.fn()} sessionId="test-session" />
    );

    stdin.write('/help\r');
    await wait(50);

    const frame = lastFrame();
    expect(frame).toContain('/quit');
    expect(frame).toContain('/clear');
    expect(frame).toContain('/help');
  });

  it('should show error for unknown commands', async () => {
    const { lastFrame, stdin } = render(
      <App fetchFn={vi.fn()} sessionId="test-session" />
    );

    stdin.write('/foo\r');
    await wait(50);

    const frame = lastFrame();
    expect(frame).toContain('Unknown command');
    expect(frame).toContain('/foo');
  });

  it('should show connection error when server is down', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const { lastFrame, stdin } = render(
      <App fetchFn={mockFetch} sessionId="test-session" />
    );

    stdin.write('hello\r');
    await wait(100);

    const frame = lastFrame();
    expect(frame).toContain('Cannot connect');
    expect(frame).toContain('ax serve');
  });

  it('should show API error messages', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const { lastFrame, stdin } = render(
      <App fetchFn={mockFetch} sessionId="test-session" />
    );

    stdin.write('hello\r');
    await wait(100);

    const frame = lastFrame();
    expect(frame).toContain('Internal Server Error');
  });

  it('should include session_id in requests', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createMockSSEStream('ok'),
    });

    const { stdin } = render(
      <App fetchFn={mockFetch} sessionId="my-session-123" />
    );

    stdin.write('hello\r');
    await wait(100);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.session_id).toBe('my-session-123');
  });

  it('should accumulate conversation history', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        body: createMockSSEStream(`Response ${callCount}`),
      });
    });

    const { stdin } = render(
      <App fetchFn={mockFetch} sessionId="test-session" />
    );

    stdin.write('First\r');
    await wait(100);
    stdin.write('Second\r');
    await wait(100);

    const body = JSON.parse(mockFetch.mock.calls[1][1].body);
    // Should have: user1, assistant1, user2
    expect(body.messages.length).toBe(3);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/cli/components/App.test.tsx`
Expected: FAIL — module not found

**Step 3: Implement App component**

Create `src/cli/components/App.tsx`:

```tsx
// src/cli/components/App.tsx
import React, { useState, useCallback } from 'react';
import { Box, useApp, useInput } from 'ink';
import { StatusBar, type ConnectionStatus } from './StatusBar.js';
import { MessageList, type ChatMessage } from './MessageList.js';
import { ThinkingIndicator } from './ThinkingIndicator.js';
import { InputBox } from './InputBox.js';
import { parseInput, isKnownCommand, formatHelp } from '../utils/commands.js';

export interface AppProps {
  fetchFn: typeof fetch;
  sessionId: string;
  stream?: boolean;
  model?: string;
}

interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function App({ fetchFn, sessionId, stream = true, model = 'default' }: AppProps) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [history, setHistory] = useState<HistoryMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');

  // Handle Ctrl+C
  useInput((_input, key) => {
    if (key.ctrl && _input === 'c') {
      exit();
    }
  });

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => [...prev, msg]);
  }, []);

  const handleSubmit = useCallback(async (value: string) => {
    const parsed = parseInput(value);

    if (parsed.type === 'empty') return;

    if (parsed.type === 'command') {
      switch (parsed.name) {
        case 'quit':
          exit();
          return;
        case 'clear':
          setMessages([]);
          setHistory([]);
          return;
        case 'help':
          addMessage({ role: 'system', content: formatHelp(), type: 'system' });
          return;
        default:
          if (!isKnownCommand(parsed.name)) {
            addMessage({
              role: 'system',
              content: `Unknown command: /${parsed.name}. Type /help for available commands.`,
              type: 'error',
            });
          }
          return;
      }
    }

    // Regular message
    const userContent = parsed.content;
    addMessage({ role: 'user', content: userContent, type: 'normal' });

    const updatedHistory: HistoryMessage[] = [...history, { role: 'user', content: userContent }];

    setIsLoading(true);

    try {
      const response = await fetchFn('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: updatedHistory,
          stream,
          session_id: sessionId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        addMessage({ role: 'system', content: errorText, type: 'error' });
        setConnectionStatus('connected');
        setIsLoading(false);
        return;
      }

      setConnectionStatus('connected');

      if (stream && response.body) {
        const assistantContent = await handleStreamResponse(response.body);
        const finalHistory: HistoryMessage[] = [
          ...updatedHistory,
          { role: 'assistant', content: assistantContent },
        ];
        setHistory(finalHistory);
      } else {
        const data = await response.json();
        const assistantContent = data.choices[0].message.content;
        addMessage({ role: 'assistant', content: assistantContent, type: 'normal' });
        const finalHistory: HistoryMessage[] = [
          ...updatedHistory,
          { role: 'assistant', content: assistantContent },
        ];
        setHistory(finalHistory);
      }
    } catch {
      addMessage({
        role: 'system',
        content: 'Cannot connect to AX server. Make sure it\'s running with: ax serve',
        type: 'error',
      });
      setConnectionStatus('disconnected');
    } finally {
      setIsLoading(false);
    }
  }, [history, fetchFn, sessionId, stream, model, exit, addMessage]);

  async function handleStreamResponse(body: ReadableStream<Uint8Array>): Promise<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    // Add placeholder message
    setMessages(prev => [...prev, { role: 'assistant', content: '', type: 'normal' }]);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return fullContent;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content;
              if (content) {
                fullContent += content;
                // Update the last message in-place
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === 'assistant') {
                    updated[updated.length - 1] = { ...last, content: fullContent };
                  }
                  return updated;
                });
              }
            } catch {
              // Ignore parse errors for incomplete JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullContent;
  }

  return (
    <Box flexDirection="column" height="100%">
      <StatusBar status={connectionStatus} model={model} />
      <MessageList messages={messages} />
      <ThinkingIndicator visible={isLoading} />
      <InputBox onSubmit={handleSubmit} isDisabled={isLoading} />
    </Box>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/cli/components/App.test.tsx`
Expected: 9/9 PASS

**Step 5: Commit**

```bash
git add src/cli/components/App.tsx tests/cli/components/App.test.tsx
git commit -m "feat: add App root component with state management, streaming, and commands"
```

---

### Task 10: Rewrite chat.ts Entry Point

Replace the readline-based `chat.ts` with an Ink-based entry point. Preserve `createSocketFetch`, `runChat` signature, and `ChatClientOptions` for backward compatibility.

**Files:**
- Modify: `src/cli/chat.ts`

**Step 1: Write the failing test**

Update `tests/cli/chat.test.ts` to test the new Ink-based client. The key behavioral contracts to preserve:
- `createChatClient({ fetch, ... }).start()` still works
- Messages are sent to the server via fetch
- Session ID is consistent
- Errors are handled gracefully

Replace `tests/cli/chat.test.ts`:

```typescript
// tests/cli/chat.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createChatClient } from '../../src/cli/chat.js';

function createMockSSEStream(content: string): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      const chunk = {
        choices: [{ delta: { content }, finish_reason: null }],
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

describe('createChatClient', () => {
  it('should create a client with start method', () => {
    const client = createChatClient({ fetch: vi.fn() as any });
    expect(client).toHaveProperty('start');
    expect(typeof client.start).toBe('function');
  });

  it('should create client with custom socket path', () => {
    const client = createChatClient({
      socketPath: '/tmp/custom.sock',
      fetch: vi.fn() as any,
    });
    expect(client).toBeDefined();
  });

  it('should create client with noStream option', () => {
    const client = createChatClient({
      noStream: true,
      fetch: vi.fn() as any,
    });
    expect(client).toBeDefined();
  });
});
```

**Step 2: Rewrite chat.ts**

Replace `src/cli/chat.ts`:

```typescript
// src/cli/chat.ts
import React from 'react';
import { render } from 'ink';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Agent } from 'undici';
import { axHome } from '../paths.js';
import { App } from './components/App.js';

// ═══════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════

export interface ChatClientOptions {
  socketPath?: string;
  noStream?: boolean;
  fetch?: typeof fetch;
}

// ═══════════════════════════════════════════════════════
// Chat Client
// ═══════════════════════════════════════════════════════

export function createChatClient(opts: ChatClientOptions = {}) {
  const socketPath = opts.socketPath ?? join(axHome(), 'ax.sock');
  const stream = opts.noStream !== true;
  const fetchFn = opts.fetch ?? createSocketFetch(socketPath);
  const sessionId = randomUUID();

  async function start(): Promise<void> {
    const { waitUntilExit } = render(
      React.createElement(App, {
        fetchFn,
        sessionId,
        stream,
      })
    );
    await waitUntilExit();
  }

  return { start };
}

// ═══════════════════════════════════════════════════════
// Unix Socket Fetch
// ═══════════════════════════════════════════════════════

function createSocketFetch(socketPath: string): typeof fetch {
  const dispatcher = new Agent({ connect: { socketPath } });
  return (input: string | URL | Request, init?: RequestInit) =>
    fetch(input, { ...init, dispatcher } as RequestInit);
}

// ═══════════════════════════════════════════════════════
// CLI Entry Point
// ═══════════════════════════════════════════════════════

export async function runChat(args: string[]): Promise<void> {
  let socketPath: string | undefined;
  let noStream = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--socket') {
      socketPath = args[++i];
    } else if (args[i] === '--no-stream') {
      noStream = true;
    }
  }

  const client = createChatClient({ socketPath, noStream });
  await client.start();
}
```

**Step 3: Run tests to verify they pass**

Run: `npx vitest run tests/cli/chat.test.ts`
Expected: 3/3 PASS

**Step 4: Verify build**

Run: `npm run build`
Expected: Clean compilation

**Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/cli/chat.ts tests/cli/chat.test.ts
git commit -m "feat: replace readline chat client with Ink terminal UI"
```

---

### Task 11: Full Integration Test

Create a test that verifies the complete flow: App renders, user sends message, streaming response arrives, message history accumulates, commands work, errors display correctly.

**Files:**
- Modify: `tests/cli/components/App.test.tsx` (add integration scenarios)

**Step 1: Add streaming edge case tests**

Add these tests to the existing `tests/cli/components/App.test.tsx`:

```tsx
// Add to existing describe('App', ...)

it('should handle multi-chunk streaming response', async () => {
  // Create a slow stream with multiple chunks
  const encoder = new TextEncoder();
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    body: new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ choices: [{ delta: { content: 'Hello' } }] })}\n\n`
        ));
        await new Promise(r => setTimeout(r, 20));
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ choices: [{ delta: { content: ' world' } }] })}\n\n`
        ));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    }),
  });

  const { lastFrame, stdin } = render(
    <App fetchFn={mockFetch} sessionId="test" />
  );

  stdin.write('hi\r');
  await wait(200);

  const frame = lastFrame();
  expect(frame).toContain('Hello world');
});

it('should handle non-streaming response', async () => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: 'Non-streamed response' } }],
    }),
    body: null,
  });

  const { lastFrame, stdin } = render(
    <App fetchFn={mockFetch} sessionId="test" stream={false} />
  );

  stdin.write('hello\r');
  await wait(100);

  expect(lastFrame()).toContain('Non-streamed response');
});

it('should disable input while loading', async () => {
  // Create a stream that never completes immediately
  const mockFetch = vi.fn().mockImplementation(() =>
    new Promise(resolve => {
      setTimeout(() => {
        resolve({
          ok: true,
          body: createMockSSEStream('done'),
        });
      }, 200);
    })
  );

  const { lastFrame, stdin } = render(
    <App fetchFn={mockFetch} sessionId="test" />
  );

  stdin.write('hello\r');
  await wait(50);

  // Should show thinking indicator while waiting
  const frame = lastFrame();
  expect(frame).toContain('thinking');
});
```

**Step 2: Run tests**

Run: `npx vitest run tests/cli/components/App.test.tsx`
Expected: 12/12 PASS

**Step 3: Commit**

```bash
git add tests/cli/components/App.test.tsx
git commit -m "test: add streaming edge cases and integration tests for chat UI"
```

---

### Task 12: Manual Testing & Polish

**Files:**
- Possibly modify: any component files as needed

**Step 1: Start the AX server**

Run: `npm run serve`
Expected: Server starts and listens on Unix socket

**Step 2: Start the chat client in another terminal**

Run: `npm run chat`
Expected: Ink UI renders with:
- StatusBar at top showing connection status
- Empty message area
- Input box at bottom with placeholder text

**Step 3: Test basic message flow**

Type `Hello, who are you?` and press Enter.
Expected:
- User message appears in blue-bordered box
- Thinking indicator shows while waiting
- Agent response streams in character-by-character in green-bordered box
- Input re-enables after response completes

**Step 4: Test slash commands**

Type `/help` → should show command list in yellow system box
Type `/clear` → should clear all messages
Type `/foo` → should show "Unknown command" in red error box

**Step 5: Test error handling**

Stop the server, then type a message.
Expected: Red error box with "Cannot connect to AX server"

**Step 6: Test Ctrl+C exit**

Press Ctrl+C.
Expected: Clean exit, no hanging processes

**Step 7: Fix any visual issues found during manual testing**

Adjust component styles, spacing, or layout as needed.

**Step 8: Run full test suite one final time**

Run: `npm test`
Expected: All tests pass

**Step 9: Final commit if any polish changes were made**

```bash
git add -A
git commit -m "fix: polish chat UI layout and styling after manual testing"
```

---

## Dependency Summary

| Package | Version | Purpose |
|---------|---------|---------|
| `ink` | ^5.0.0 | React renderer for terminal |
| `react` | ^18.3.1 | Component model (peer dep of ink) |
| `ink-text-input` | ^6.0.0 | Text input component |
| `ink-spinner` | ^5.0.0 | Loading spinner |
| `marked` | ^11.0.0 | Markdown parser |
| `chalk` | ^5.3.0 | ANSI color styling |
| `highlight.js` | ^11.9.0 | Syntax highlighting for code blocks |
| `ink-testing-library` | ^4.0.0 | (dev) Testing Ink components |
| `@types/react` | ^18.3.0 | (dev) React type definitions |

## Risk Notes

1. **ink-scroll-area**: The design doc mentions this package. If it doesn't exist or is incompatible with Ink 5, the `MessageList` component uses a simple vertical `Box` with `flexGrow={1}` instead. Terminal scrollback handles overflow naturally. Scrolling can be added later via `useInput` + viewport slicing.

2. **TSX in Node16 module**: TypeScript 5.9 supports `jsx: "react-jsx"` with `module: "Node16"`. The compiled `.js` files import from `react/jsx-runtime`. Verify the build works in Task 1 Step 4 before proceeding.

3. **ink-testing-library**: If this package has compatibility issues with Ink 5, tests can fall back to rendering components and checking the output string directly via `render()` from ink itself (non-test mode with a writable stream).

4. **Existing test migration**: The old chat tests used mock stdin/stdout streams. The new tests use ink-testing-library's `stdin.write()` and `lastFrame()`. The behavioral contracts (session ID, history, error handling) are preserved.
