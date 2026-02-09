import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, ChatRequest, ChatChunk, Config, ContentBlock } from '../types.js';

/** Convert a Message.content (string or ContentBlock[]) to Anthropic API format. */
function toAnthropicContent(
  content: string | ContentBlock[],
): string | Anthropic.ContentBlockParam[] {
  if (typeof content === 'string') return content;
  return content.map((block): Anthropic.ContentBlockParam => {
    if (block.type === 'text') return { type: 'text', text: block.text };
    if (block.type === 'tool_use') {
      return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
    }
    // tool_result
    return { type: 'tool_result', tool_use_id: block.tool_use_id, content: block.content };
  });
}

export async function create(_config: Config): Promise<LLMProvider> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is required.\n' +
      'Set it with: export ANTHROPIC_API_KEY=sk-ant-...',
    );
  }

  const client = new Anthropic();

  return {
    name: 'anthropic',

    async *chat(req: ChatRequest): AsyncIterable<ChatChunk> {
      const systemMessages = req.messages.filter(m => m.role === 'system');
      const nonSystemMessages = req.messages.filter(m => m.role !== 'system');

      const tools = req.tools?.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Tool['input_schema'],
      }));

      const systemText = systemMessages
        .map(m => typeof m.content === 'string' ? m.content : '')
        .join('\n\n');

      const stream = client.messages.stream({
        model: req.model || 'claude-sonnet-4-20250514',
        max_tokens: req.maxTokens ?? 4096,
        system: systemText || undefined,
        messages: nonSystemMessages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: toAnthropicContent(m.content),
        })),
        ...(tools?.length ? { tools } : {}),
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          const delta = event.delta;
          if ('text' in delta) {
            yield { type: 'text', content: delta.text };
          }
        } else if (event.type === 'content_block_stop') {
          const finalMsg = await stream.finalMessage();
          const block = finalMsg.content[event.index];
          if (block?.type === 'tool_use') {
            yield {
              type: 'tool_use',
              toolCall: {
                id: block.id,
                name: block.name,
                args: block.input as Record<string, unknown>,
              },
            };
          }
        }
      }

      const finalMessage = await stream.finalMessage();
      yield {
        type: 'done',
        usage: {
          inputTokens: finalMessage.usage.input_tokens,
          outputTokens: finalMessage.usage.output_tokens,
        },
      };
    },

    async models(): Promise<string[]> {
      return [
        'claude-sonnet-4-20250514',
        'claude-opus-4-20250514',
        'claude-haiku-3-5-20241022',
      ];
    },
  };
}
