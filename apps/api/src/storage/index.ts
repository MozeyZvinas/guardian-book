import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { BucketConfig } from '../config.js'
import { HttpError } from '../lib/http.js'
import type { Logger } from '../logger.js'

/**
 * Private object storage (spec 03 §7 `BUCKET_*`; brief B04 §1). The Railway bucket is
 * S3-compatible and private: nothing in it has a public URL, so the only way out is a
 * presigned GET that expires within `PRESIGN_MAX_SECONDS`. Objects are never written with
 * a public ACL (there is no ACL parameter anywhere in this module: that is the test).
 *
 * Railway buckets use virtual-hosted-style addressing (`https://<bucket>.<endpoint-host>/`),
 * hence `forcePathStyle: false` and the region as given (usually `auto`).
 *
 * Not configured → `null`; the routes answer 503 `storage_not_configured` and the rest of
 * the app runs.
 */

export const PRESIGN_MAX_SECONDS = 300

export interface StoredObject {
  body: Buffer
  contentType: string
}

export interface Storage {
  readonly kind: 's3' | 'memory'
  /** The origin presigned URLs point at, for the CSP `img-src` allow-list. */
  readonly presignOrigin: string
  putObject(key: string, body: Buffer, contentType: string): Promise<void>
  getObject(key: string): Promise<StoredObject | null>
  /** A GET URL valid for at most `PRESIGN_MAX_SECONDS` (less when asked). */
  presignGet(key: string, expiresInSeconds?: number): Promise<string>
}

export const storageNotConfigured = () =>
  new HttpError(503, 'storage_not_configured', 'Uploads are not configured on this server yet. Typed answers still work.')

function clampExpiry(seconds: number | undefined): number {
  const asked = seconds ?? PRESIGN_MAX_SECONDS
  return Math.max(1, Math.min(PRESIGN_MAX_SECONDS, Math.floor(asked)))
}

/** `https://<bucket>.<endpoint host>` for a virtual-hosted bucket. */
export function virtualHostedOrigin(endpoint: string, bucket: string): string {
  const url = new URL(endpoint)
  return `${url.protocol}//${bucket}.${url.host}`
}

export function createStorage(config: BucketConfig, logger: Logger): Storage | null {
  if (!config.configured || !config.endpoint || !config.name || !config.accessKeyId || !config.secretAccessKey || !config.region) {
    return null
  }
  const bucket = config.name
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: false,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  })
  const presignOrigin = virtualHostedOrigin(config.endpoint, bucket)
  logger.info('storage configured', { kind: 's3', presignOrigin })

  return {
    kind: 's3',
    presignOrigin,
    async putObject(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }))
    },
    async getObject(key) {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
        if (!result.Body) return null
        const bytes = await result.Body.transformToByteArray()
        return { body: Buffer.from(bytes), contentType: result.ContentType ?? 'application/octet-stream' }
      } catch (err) {
        if ((err as { name?: string })?.name === 'NoSuchKey') return null
        throw err
      }
    },
    presignGet(key, expiresInSeconds) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: clampExpiry(expiresInSeconds) })
    },
  }
}

/** In-process storage for tests and the e2e server: same contract, nothing public. */
export function memoryStorage(origin = 'https://bucket.guardianbook.test'): Storage & { objects: Map<string, StoredObject> } {
  const objects = new Map<string, StoredObject>()
  return {
    kind: 'memory',
    presignOrigin: origin,
    objects,
    async putObject(key, body, contentType) {
      objects.set(key, { body: Buffer.from(body), contentType })
    },
    async getObject(key) {
      return objects.get(key) ?? null
    },
    async presignGet(key, expiresInSeconds) {
      const expires = clampExpiry(expiresInSeconds)
      return `${origin}/${key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${expires}&X-Amz-Signature=memory`
    },
  }
}
