import { MAX_IMAGE_EDGE_PX } from '@guardian-book/shared'

/**
 * Client-side downscale before upload (spec 06 §2): at most 2,000 px on the long edge,
 * JPEG at 0.85, so a 12-megapixel phone photo does not cost 4 MB of data. The EXIF
 * orientation is applied while decoding; the server strips metadata again regardless.
 * Anything that is not a raster image (a PDF), or that fails to decode, goes up as it is.
 */
export async function prepareUpload(file: File, maxEdge = MAX_IMAGE_EDGE_PX): Promise<{ blob: Blob; filename: string }> {
  if (!file.type.startsWith('image/')) return { blob: file, filename: file.name || 'upload' }
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.type === 'image/jpeg' && file.size < 1_500_000) {
      bitmap.close()
      return { blob: file, filename: file.name || 'photo.jpg' }
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('no 2d context')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob) throw new Error('toBlob failed')
    return { blob, filename: 'photo.jpg' }
  } catch {
    return { blob: file, filename: file.name || 'photo' }
  }
}

export function describeSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
