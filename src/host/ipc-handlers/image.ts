/**
 * IPC handler: Image generation.
 *
 * Generated images are held in memory (per session) rather than written to
 * disk. After the agent finishes, the host calls drainGeneratedImages() to
 * retrieve them for the outbound channel (e.g. Slack upload) and conversation
 * history persistence.
 */
import { randomUUID } from 'node:crypto';
import type { ProviderRegistry } from '../../types.js';
import type { IPCContext } from '../ipc-server.js';
import { getLogger } from '../../logger.js';

const logger = getLogger().child({ component: 'ipc' });

const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

export interface GeneratedImage {
  fileId: string;
  mimeType: string;
  data: Buffer;
}

/** Session → list of images generated during that session's completion. */
const pendingImages = new Map<string, GeneratedImage[]>();

/**
 * Retrieve and remove all images generated during a session's completion.
 * Called by processCompletion after the agent finishes so images can be
 * attached to the outbound channel message without a disk round-trip.
 */
export function drainGeneratedImages(sessionId: string): GeneratedImage[] {
  const images = pendingImages.get(sessionId);
  pendingImages.delete(sessionId);
  return images ?? [];
}

export function createImageHandlers(providers: ProviderRegistry) {
  return {
    image_generate: async (req: any, ctx: IPCContext) => {
      if (!providers.image) {
        throw new Error(
          'No image provider configured. Add models.image to ax.yaml ' +
          '(e.g. models: { default: [...], image: ["openai/gpt-image-1.5"] })',
        );
      }

      const result = await providers.image.generate({
        prompt: req.prompt,
        model: req.model ?? 'gpt-image-1.5',
        size: req.size,
        quality: req.quality,
      });

      // Keep generated image in memory — drainGeneratedImages() retrieves it
      // after the agent finishes so the channel handler can upload directly.
      const ext = MIME_TO_EXT[result.mimeType] ?? '.png';
      const fileId = `generated-${randomUUID().slice(0, 8)}${ext}`;

      const entry: GeneratedImage = {
        fileId,
        mimeType: result.mimeType,
        data: result.image,
      };

      const list = pendingImages.get(ctx.sessionId);
      if (list) {
        list.push(entry);
      } else {
        pendingImages.set(ctx.sessionId, [entry]);
      }

      logger.debug('image_generate', { fileId, model: result.model, bytes: result.image.length });

      return {
        fileId,
        url: `/v1/files/${fileId}`,
        mimeType: result.mimeType,
        text: result.text,
        model: result.model,
        bytes: result.image.length,
      };
    },
  };
}
