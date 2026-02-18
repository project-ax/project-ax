// src/cli/components/App.tsx
import React, { useState, useCallback, useEffect, useRef, useReducer } from 'react';
import { Box, Static, Text, useApp, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { StatusBar, type ConnectionStatus } from './StatusBar.js';
import { Message } from './Message.js';
import { type ChatMessage } from './MessageList.js';
import { InputBox } from './InputBox.js';
import { parseInput, isKnownCommand, formatHelp } from '../utils/commands.js';

export interface AppProps {
  fetchFn: typeof fetch;
  sessionId: string;
  stream?: boolean;
  model?: string;
  /** Test hook: called with the submit function so tests can bypass stdin */
  onReady?: (submit: (value: string) => void) => void;
}

interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatState {
  messages: ChatMessage[];
  streamingContent: string | null;
}

type ChatAction =
  | { type: 'ADD_MESSAGE'; message: ChatMessage }
  | { type: 'STREAM_START' }
  | { type: 'STREAM_UPDATE'; content: string }
  | { type: 'STREAM_COMPLETE'; message: ChatMessage }
  | { type: 'CLEAR' };

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.message] };
    case 'STREAM_START':
      return { ...state, streamingContent: '' };
    case 'STREAM_UPDATE':
      return { ...state, streamingContent: action.content };
    case 'STREAM_COMPLETE':
      return {
        streamingContent: null,
        messages: [...state.messages, action.message],
      };
    case 'CLEAR':
      return { messages: [], streamingContent: null };
  }
}

export function App({ fetchFn, sessionId, stream = true, model = 'default', onReady }: AppProps) {
  const { exit } = useApp();
  const [chatState, dispatch] = useReducer(chatReducer, { messages: [], streamingContent: null });
  const [history, setHistory] = useState<HistoryMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [lastResponseMs, setLastResponseMs] = useState<number | undefined>(undefined);
  const requestStartRef = useRef<number>(0);
  const historyRef = useRef<HistoryMessage[]>([]);

  // Keep ref in sync for use in async callbacks
  historyRef.current = history;

  // Check server health on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchFn('http://localhost/health', { method: 'GET' });
        if (!cancelled) {
          setConnectionStatus(res.ok ? 'connected' : 'disconnected');
        }
      } catch {
        if (!cancelled) {
          setConnectionStatus('disconnected');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [fetchFn]);

  // Handle Ctrl+C
  useInput((_input, key) => {
    if (key.ctrl && _input === 'c') {
      exit();
    }
  });

  const addMessage = useCallback((msg: ChatMessage) => {
    dispatch({ type: 'ADD_MESSAGE', message: msg });
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
          dispatch({ type: 'CLEAR' });
          setHistory([]);
          historyRef.current = [];
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

    const updatedHistory: HistoryMessage[] = [...historyRef.current, { role: 'user', content: userContent }];
    setHistory(updatedHistory);
    historyRef.current = updatedHistory;

    setIsLoading(true);
    requestStartRef.current = Date.now();

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
        // Atomic: clear streaming + commit message in a single state update
        // to prevent Ink's <Static> from rendering both simultaneously
        dispatch({ type: 'STREAM_COMPLETE', message: { role: 'assistant', content: assistantContent, type: 'normal' } });
        const finalHistory = [...updatedHistory, { role: 'assistant' as const, content: assistantContent }];
        setHistory(finalHistory);
        historyRef.current = finalHistory;
      } else {
        const data = await response.json();
        const assistantContent = data.choices[0].message.content;
        addMessage({ role: 'assistant', content: assistantContent, type: 'normal' });
        const finalHistory = [...updatedHistory, { role: 'assistant' as const, content: assistantContent }];
        setHistory(finalHistory);
        historyRef.current = finalHistory;
      }
    } catch (err) {
      const { diagnoseError } = await import('../../errors.js');
      const diagnosed = diagnoseError(err as Error);
      addMessage({
        role: 'system',
        content: `${diagnosed.diagnosis}: ${diagnosed.raw}\n${diagnosed.suggestion}`,
        type: 'error',
      });
      setConnectionStatus('disconnected');
    } finally {
      setLastResponseMs(Date.now() - requestStartRef.current);
      setIsLoading(false);
    }
  }, [fetchFn, sessionId, stream, model, exit, addMessage]);

  // Keep a stable ref to latest handleSubmit for the onReady callback
  const handleSubmitRef = useRef(handleSubmit);
  handleSubmitRef.current = handleSubmit;

  // Expose a stable submit wrapper for tests — called synchronously during render
  const onReadyCalled = useRef(false);
  if (onReady && !onReadyCalled.current) {
    onReadyCalled.current = true;
    onReady((value: string) => handleSubmitRef.current(value));
  }

  async function handleStreamResponse(body: ReadableStream<Uint8Array>): Promise<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    dispatch({ type: 'STREAM_START' });

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
                dispatch({ type: 'STREAM_UPDATE', content: fullContent });
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
    <Box flexDirection="column">
      <Static items={chatState.messages}>
        {(msg, i) => (
          <Message key={i} role={msg.role} content={msg.content} type={msg.type} />
        )}
      </Static>
      {chatState.streamingContent !== null && (
        <Message role="assistant" content={chatState.streamingContent} type="normal" />
      )}
      <InputBox onSubmit={handleSubmit} isDisabled={isLoading} />
      <Box justifyContent="space-between">
        <Box>
          {isLoading ? (
            <>
              <Text color="green"><Spinner type="dots" /></Text>
              <Text color="gray"> thinking...</Text>
            </>
          ) : null}
        </Box>
        <StatusBar
          status={connectionStatus}
          model={model}
          streaming={stream}
          lastResponseMs={lastResponseMs}
          messageCount={chatState.messages.length}
        />
      </Box>
    </Box>
  );
}
