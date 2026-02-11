# Ink-based Chat UI Design

**Date:** 2026-02-10
**Status:** Approved
**Replaces:** Current readline-based chat interface in `src/cli/chat.ts`

## Overview

Replace the basic readline chat client with a rich terminal UI using Ink (React for CLIs). The new implementation provides streaming responses with incremental rendering, scrollable message history, markdown formatting with syntax highlighting, and slash commands for common actions.

## Goals

- **Better UX:** Scrollable history, formatted markdown, clear visual separation between messages
- **Progressive streaming:** Show assistant responses as they arrive, character by character
- **Discoverability:** Slash commands for common actions (/quit, /clear, /help)
- **Preserve architecture:** Keep Unix socket communication and server API unchanged

## Non-Goals

- Web UI or GUI client
- Session persistence across restarts
- Multi-user chat or collaboration features
- Voice input/output

## Architecture

### Component Structure

```
App (root)
├── StatusBar — connection status, model name, session ID
├── MessageList (ink-scroll-area)
│   └── Message[] — individual message boxes
├── Spinner — "thinking..." loading indicator
└── InputBox (ink-text-input) — text input + command parsing
```

### State Management

The `App` component maintains:

```typescript
interface AppState {
  messages: Array<{
    role: 'user' | 'assistant' | 'system' | 'error';
    content: string;
    type: 'normal' | 'error' | 'system';
  }>;
  isLoading: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
  currentInput: string;
  sessionId: string;
}
```

### Data Flow

1. User types in `InputBox`
2. On Enter, input is parsed:
   - If starts with `/` → handle as command
   - Otherwise → send as message to server
3. While waiting for response:
   - Set `isLoading: true`
   - Show `Spinner` in message area
   - Disable input
4. Server streams response chunks
5. Update last message content incrementally
6. On completion, set `isLoading: false`, re-enable input

## Markdown Rendering

### Processing Pipeline

```
Raw markdown → marked tokenizer → custom renderer with chalk → ANSI string → Ink <Text>
```

### Custom Renderer

Extend marked's renderer to produce ANSI-styled strings:

- **Code blocks:** Syntax highlighting via `highlight.js`, wrap in chalk.gray.bgBlack
- **Inline code:** chalk.gray.bgBlack(`code`)
- **Headers:** chalk.bold.cyan
- **Lists:** Proper indentation + bullet characters
- **Emphasis:** chalk.italic for *italic*, chalk.bold for **bold**
- **Links:** chalk.blue.underline with URL in parentheses

Implementation: Pure function `renderMarkdown(content: string): string` in `src/cli/utils/markdown.ts`

### Message Box Styling

Each message renders in an Ink `<Box>` with colored borders:

- **User:** Blue border, "you" label
- **Assistant:** Green border, "agent" label
- **Error:** Red border, "error" label
- **System:** Yellow border, "system" label

## Scrolling Behavior

Using `ink-scroll-area`:

- **Auto-scroll:** New messages automatically scroll to bottom
- **Manual scroll:** User can scroll up with Page Up/Down (or arrow keys)
- **Pause auto-scroll:** When user scrolls up manually
- **Resume auto-scroll:** When user sends new message or scrolls to bottom

## Input & Commands

### Input Component

```tsx
<TextInput
  value={input}
  onChange={setInput}
  onSubmit={handleSubmit}
  placeholder="Type a message or /help for commands..."
  isDisabled={isLoading}
/>
```

### Command Parser

```typescript
function handleSubmit(value: string) {
  if (value.startsWith('/')) {
    const command = value.slice(1).split(' ')[0];
    const args = value.slice(command.length + 2);
    handleCommand(command, args);
  } else {
    sendMessage(value);
  }
}
```

### Supported Commands

- `/quit` — Exit gracefully (cleanup, close connections)
- `/clear` — Clear message history (reset `messages` array)
- `/help` — Show help message listing available commands

Unknown commands → inline error message: "Unknown command: /foo. Type /help for available commands."

## Streaming Responses

Preserve existing streaming logic, adapted for React state:

```typescript
async function streamResponse(body: ReadableStream) {
  const messageId = messages.length;

  // Add placeholder message
  setMessages([...messages, {
    role: 'assistant',
    content: '',
    type: 'normal'
  }]);

  // Stream chunks
  const reader = body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          setIsLoading(false);
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices[0]?.delta?.content;

          if (content) {
            setMessages(prev => {
              const updated = [...prev];
              updated[messageId].content += content;
              return updated;
            });
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
  }
}
```

Each chunk triggers a re-render, showing progressive response building.

## Error Handling

Errors appear as red-bordered message boxes in the chat flow:

### Error Types

- **Network errors:** "Cannot connect to AX server. Make sure it's running with: ax serve"
- **API errors (4xx/5xx):** Show server's error response
- **Parse errors:** "Invalid response from server"
- **Command errors:** "Unknown command: /foo. Type /help for available commands."

### Connection Status Indicator

Status bar shows:

- `connecting` → `○ Connecting...` (gray)
- `connected` → `● Connected` (green)
- `disconnected` → `○ Disconnected` (red)

Updates on: initial connection, successful request, failed request, disconnect.

## Dependencies

Add to `package.json`:

```json
{
  "ink": "^5.0.0",
  "ink-text-input": "^6.0.0",
  "ink-scroll-area": "^1.0.0",
  "ink-spinner": "^5.0.0",
  "marked": "^11.0.0",
  "chalk": "^5.3.0",
  "highlight.js": "^11.9.0"
}
```

## File Structure

```
src/cli/
├── chat.ts              # Entry point (replace current)
├── components/
│   ├── App.tsx          # Root component, state management
│   ├── StatusBar.tsx    # Top status bar
│   ├── MessageList.tsx  # Scrollable message area
│   ├── Message.tsx      # Individual message box
│   ├── InputBox.tsx     # Text input + command handling
│   └── Spinner.tsx      # Loading indicator
└── utils/
    ├── markdown.ts      # Markdown → ANSI conversion
    └── commands.ts      # Command parser & handlers
```

## Migration Strategy

1. **Preserve server communication:** Keep `createSocketFetch` and `/v1/chat/completions` API contract
2. **Replace presentation layer:** Replace readline with Ink's `render(<App />)`
3. **Maintain CLI flags:** `--socket` and `--no-stream` work as before (passed as props to App)
4. **Same entry point:** `runChat(args)` signature unchanged

## Testing Considerations

- **Unit tests:** Test markdown renderer, command parser in isolation
- **Integration tests:** Mock socket fetch, test message flow and streaming
- **Manual testing:** Verify scrolling, error states, commands work in real terminal

## Open Questions

None — design approved.

## Future Enhancements (Out of Scope)

- Additional slash commands (`/model`, `/save`, `/load`)
- Session persistence
- Custom themes/color schemes
- Vim-style keybindings
- Multi-line input (Shift+Enter)
