import type { Request } from 'express'
import { MAX_UPLOAD_BYTES } from '@guardian-book/shared'
import { HttpError } from '../lib/http.js'

/**
 * Multipart upload reading without a dependency: the raw body (capped) is handed to the
 * platform `Response.formData()` parser that Node 24 ships. One file part (`file`) and
 * text fields. Anything over the cap is refused before it is buffered in full.
 */

export interface MultipartBody {
  fields: Record<string, string>
  file: { bytes: Buffer; filename: string | null; declaredType: string | null } | null
}

/** Headroom for field text and part boundaries above the file size cap. */
const OVERHEAD_BYTES = 256 * 1024

export const fileTooLarge = () => new HttpError(413, 'file_too_large', 'That file is over 8 MB. Take the photo again at a lower size.')
export const badMultipart = () => new HttpError(400, 'bad_request', 'The upload could not be read.')

export function isMultipart(req: Request): boolean {
  return (req.headers['content-type'] ?? '').toLowerCase().startsWith('multipart/form-data')
}

async function readCapped(req: Request, cap: number): Promise<Buffer> {
  const declared = Number(req.headers['content-length'] ?? 0)
  if (Number.isFinite(declared) && declared > cap) throw fileTooLarge()
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    total += buffer.length
    if (total > cap) throw fileTooLarge()
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

export async function readMultipart(req: Request, maxFileBytes = MAX_UPLOAD_BYTES): Promise<MultipartBody> {
  const contentType = req.headers['content-type']
  if (!contentType) throw badMultipart()
  const raw = await readCapped(req, maxFileBytes + OVERHEAD_BYTES)
  let form: FormData
  try {
    form = await new Response(raw, { headers: { 'content-type': contentType } }).formData()
  } catch {
    throw badMultipart()
  }
  const fields: Record<string, string> = {}
  let file: MultipartBody['file'] = null
  for (const [name, value] of form.entries()) {
    if (typeof value === 'string') {
      fields[name] = value
      continue
    }
    if (name !== 'file') continue
    const bytes = Buffer.from(await value.arrayBuffer())
    if (bytes.length > maxFileBytes) throw fileTooLarge()
    file = { bytes, filename: value.name || null, declaredType: value.type || null }
  }
  return { fields, file }
}
