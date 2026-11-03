import sharp from 'sharp'
import { MAX_IMAGE_EDGE_PX, MAX_UPLOAD_BYTES, type UploadMediaType } from '@guardian-book/shared'
import { HttpError } from '../lib/http.js'

/**
 * Upload preparation (spec 02 P0-03; brief B04 §1). The media type comes from the bytes,
 * never from the client's header. Images are re-encoded with `sharp`, which drops EXIF,
 * ICC, XMP and every other metadata block unless `.withMetadata()` is asked for (it is
 * not), after honouring the EXIF orientation so the stored pixels are upright. PDFs are
 * checked for their header and stored as-is.
 */

export type ImageMediaType = Exclude<UploadMediaType, 'application/pdf'>

export interface PreparedImage {
  buffer: Buffer
  mediaType: ImageMediaType
  width: number
  height: number
}

const JPEG_QUALITY = 85

export const fileTooLarge = () => new HttpError(413, 'file_too_large', 'That file is over 8 MB. Take the photo again at a lower size.')
export const unsupportedFile = () =>
  new HttpError(400, 'unsupported_file', 'Use a JPEG, PNG or WebP photo, or a PDF.')
export const unreadableImage = () => new HttpError(400, 'unreadable_image', 'That image could not be read. Try another photo.')

/** The media type the bytes say they are, or null for anything this build does not take. */
export function sniffMediaType(bytes: Buffer): UploadMediaType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp'
  }
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf'
  return null
}

export function extensionFor(mediaType: UploadMediaType): string {
  switch (mediaType) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'application/pdf':
      return 'pdf'
  }
}

export function assertUploadSize(bytes: Buffer): void {
  if (bytes.length > MAX_UPLOAD_BYTES) throw fileTooLarge()
}

/** Re-encodes an image: upright, at most `MAX_IMAGE_EDGE_PX` on the long edge, no metadata. */
export async function prepareImage(bytes: Buffer, mediaType: ImageMediaType): Promise<PreparedImage> {
  assertUploadSize(bytes)
  let pipeline = sharp(bytes, { failOn: 'error', limitInputPixels: 80_000_000 })
    .rotate()
    .resize({ width: MAX_IMAGE_EDGE_PX, height: MAX_IMAGE_EDGE_PX, fit: 'inside', withoutEnlargement: true })
  switch (mediaType) {
    case 'image/jpeg':
      pipeline = pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      break
    case 'image/png':
      pipeline = pipeline.png({ compressionLevel: 8 })
      break
    case 'image/webp':
      pipeline = pipeline.webp({ quality: JPEG_QUALITY })
      break
  }
  try {
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true })
    return { buffer: data, mediaType, width: info.width, height: info.height }
  } catch {
    throw unreadableImage()
  }
}

/** True when the stored bytes carry no EXIF block (what the integration test reads back). */
export async function hasExif(bytes: Buffer): Promise<boolean> {
  const metadata = await sharp(bytes).metadata()
  return Boolean(metadata.exif && metadata.exif.length > 0)
}
