import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import type { CorpusConfig } from '../config.js'

/**
 * The DBE corpus bucket (brief B17 phase A; D32, D40): the founder's private Cloudflare R2
 * bucket, opened with a read-only token from the git-ignored `.env` (`DBE_R2_*`). This
 * module can list and fetch; there is no put, no delete and no presign anywhere in it, so
 * nothing here can ever hand out a bucket URL (the test for that is the absence of those
 * calls). Only the extraction CLI uses it; the server never does.
 *
 * R2 speaks S3 with path-style addressing (`https://<account>.r2.cloudflarestorage.com/<bucket>/<key>`)
 * and the region `auto`.
 */

export interface CorpusObject {
  key: string
  size: number
}

export interface CorpusBucket {
  readonly bucket: string
  /** Every key under `prefix` (all of them when no prefix), in the bucket's own order. */
  list(prefix?: string): Promise<CorpusObject[]>
  /** The object's bytes, or null when the key does not exist. */
  get(key: string): Promise<Buffer | null>
}

export function createCorpusBucket(config: CorpusConfig): CorpusBucket | null {
  if (!config.configured || !config.endpoint || !config.bucket || !config.accessKeyId || !config.secretAccessKey) return null
  const bucket = config.bucket
  const client = new S3Client({
    endpoint: config.endpoint,
    region: 'auto',
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  })
  return {
    bucket,
    async list(prefix) {
      const objects: CorpusObject[] = []
      let token: string | undefined
      do {
        const page = await client.send(
          new ListObjectsV2Command({ Bucket: bucket, ...(prefix ? { Prefix: prefix } : {}), ...(token ? { ContinuationToken: token } : {}), MaxKeys: 1000 }),
        )
        for (const object of page.Contents ?? []) {
          if (object.Key) objects.push({ key: object.Key, size: object.Size ?? 0 })
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined
      } while (token)
      return objects
    },
    async get(key) {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
        if (!result.Body) return null
        return Buffer.from(await result.Body.transformToByteArray())
      } catch (err) {
        if ((err as { name?: string })?.name === 'NoSuchKey') return null
        throw err
      }
    },
  }
}
