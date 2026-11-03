import type { StrictJsonSchema } from '@guardian-book/shared'
import { z } from 'zod'

/**
 * The wire boundary. The gateway builds a `ChatRequest`, a `Transport` sends it and
 * reports what came back without throwing, so retries, timeouts and error mapping live in
 * one place (`gateway.ts`) and the tests can script any sequence of outcomes.
 */

/** Images are accepted as base64 (what the upload path has) or a URL (presigned, B04). */
export type ImageInput =
  | { kind: 'base64'; mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string }
  | { kind: 'url'; url: string }

export interface ChatTextPart {
  type: 'text'
  text: string
}

/**
 * Meta, "Image understanding" (https://dev.meta.ai/docs/image-understanding), read
 * 3 Nov 2026: "Chat Completions wraps the image in an `image_url` object (whose `url` is a
 * public URL or a base64 data URL)"; base64 example `"data:image/jpeg;base64,{base64_image}"`.
 */
export interface ChatImagePart {
  type: 'image_url'
  image_url: { url: string }
}

export interface ChatSystemMessage {
  role: 'system'
  content: string
}

/** "Only include images in `user`-role messages." (same page, same date) */
export interface ChatUserMessage {
  role: 'user'
  content: string | Array<ChatTextPart | ChatImagePart>
}

export interface ChatRequest {
  model: string
  messages: [ChatSystemMessage, ChatUserMessage]
  /**
   * Meta, "Structured output" (https://dev.meta.ai/docs/structured-output), read
   * 3 Nov 2026: "Set `response_format` to `type: "json_schema"` and provide your schema in
   * the `json_schema` field." and "Set `strict: true` to require that the server validates
   * your schema against the strict subset."
   */
  response_format: { type: 'json_schema'; json_schema: StrictJsonSchema }
  max_tokens: number
  temperature: 0
}

export interface TransportOptions {
  timeoutMs: number
  signal?: AbortSignal | undefined
}

/** The parts of a Chat Completions response the gateway reads. Unknown keys are kept. */
export const chatCompletionBodySchema = z.looseObject({
  id: z.string().optional(),
  model: z.string().optional(),
  choices: z
    .array(
      z.looseObject({
        finish_reason: z.string().nullable().optional(),
        message: z.looseObject({
          content: z.string().nullable().optional(),
          refusal: z.string().nullable().optional(),
        }),
      }),
    )
    .min(1),
  usage: z
    .looseObject({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
      prompt_tokens_details: z.looseObject({ cached_tokens: z.number().int().nonnegative().optional() }).nullable().optional(),
    })
    .nullable()
    .optional(),
})
export type ChatCompletionBody = z.infer<typeof chatCompletionBodySchema>

export type TransportResult =
  | { ok: true; status: number; requestId: string | null; body: unknown }
  | {
      ok: false
      kind: 'http'
      status: number
      requestId: string | null
      retryAfter: string | null
      /** The provider's error type or code, never its full message (it may echo input). */
      errorCode: string | null
    }
  | { ok: false; kind: 'timeout' }
  | { ok: false; kind: 'aborted' }
  | { ok: false; kind: 'network'; errorName: string }

export type Transport = (request: ChatRequest, options: TransportOptions) => Promise<TransportResult>

export function imageToPart(image: ImageInput): ChatImagePart {
  if (image.kind === 'url') return { type: 'image_url', image_url: { url: image.url } }
  return { type: 'image_url', image_url: { url: `data:${image.mediaType};base64,${image.data}` } }
}
