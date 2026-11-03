import type { Logger } from '../logger.js'
import { createLogger } from '../logger.js'
import type { ChatRequest, Transport, TransportOptions, TransportResult } from './transport.js'

/**
 * Test doubles for the gateway: a transport that plays back a script of results and
 * records every request, and a logger that keeps its lines.
 */

export interface ScriptedTransport {
  transport: Transport
  requests: Array<{ request: ChatRequest; options: TransportOptions }>
}

export function scriptedTransport(script: Array<TransportResult | ((request: ChatRequest) => TransportResult)>): ScriptedTransport {
  const requests: ScriptedTransport['requests'] = []
  const queue = [...script]
  const transport: Transport = async (request, options) => {
    requests.push({ request, options })
    const next = queue.shift()
    if (!next) throw new Error('scriptedTransport: no more scripted results')
    return typeof next === 'function' ? next(request) : next
  }
  return { transport, requests }
}

export function okResponse(
  content: unknown,
  extra: { requestId?: string; promptTokens?: number; completionTokens?: number; cachedTokens?: number; finishReason?: string; model?: string } = {},
): TransportResult {
  return {
    ok: true,
    status: 200,
    requestId: extra.requestId ?? 'req_test',
    body: {
      id: 'chatcmpl_test',
      model: extra.model ?? 'muse-spark-1.3',
      choices: [
        {
          finish_reason: extra.finishReason ?? 'stop',
          message: { role: 'assistant', content: typeof content === 'string' ? content : JSON.stringify(content) },
        },
      ],
      usage: {
        prompt_tokens: extra.promptTokens ?? 1000,
        completion_tokens: extra.completionTokens ?? 200,
        prompt_tokens_details: { cached_tokens: extra.cachedTokens ?? 0 },
      },
    },
  }
}

export function httpError(status: number, extra: { retryAfter?: string; requestId?: string; errorCode?: string } = {}): TransportResult {
  return {
    ok: false,
    kind: 'http',
    status,
    requestId: extra.requestId ?? null,
    retryAfter: extra.retryAfter ?? null,
    errorCode: extra.errorCode ?? null,
  }
}

export function capturingLogger(): { logger: Logger; lines: string[] } {
  const lines: string[] = []
  return { logger: createLogger((line) => lines.push(line)), lines }
}

export const immediateSleep = async (): Promise<void> => {}
