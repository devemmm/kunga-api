import * as Minio from 'minio';
import { config } from '../config/index.js';

// ─── CLIENT ──────────────────────────────────────────────────────────────────
// IMPORTANT: endPoint must resolve to the MinIO S3 API port (default 9000),
// NOT the web console port (9001). If you see "S3 API Requests must be made to
// API port", the endpoint URL is pointing at the console — add :9000 explicitly.

function buildClient() {
  const url = new URL(config.minio.endpoint);
  return new Minio.Client({
    endPoint:  url.hostname,
    port:      url.port ? parseInt(url.port, 10) : (url.protocol === 'https:' ? 443 : 80),
    useSSL:    url.protocol === 'https:',
    accessKey: config.minio.accessKey,
    secretKey: config.minio.secretKey,
    // Pin the region so the SDK skips its `getBucketRegion` lookup
    // (a `GET /bucket?location` request). Behind some reverse proxies
    // that request comes back as an empty/redirected body, which the
    // SDK fails to parse as XML and throws an `S3Error` with an empty
    // `.message` — surfacing to clients as "Thumbnail upload error: ".
    region: 'us-east-1',
  });
}

let _client: Minio.Client | null = null;
export function getMinioClient(): Minio.Client {
  if (!_client) _client = buildClient();
  return _client;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Upload a Buffer to MinIO and return the public object URL.
 *
 * The public URL is built from MINIO_PUBLIC_URL (the pretty domain without port),
 * separate from MINIO_ENDPOINT (which points at the API port).
 *
 * Example:
 *   MINIO_ENDPOINT  = https://resources.devemm.rw:9000   ← API calls
 *   MINIO_PUBLIC_URL = https://resources.devemm.rw        ← public URLs
 *   result URL       = https://resources.devemm.rw/kunga/resources/uuid.jpg
 */
export async function uploadToMinio(
  objectName: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const client = getMinioClient();
  const bucket  = config.minio.bucket;

  await client.putObject(bucket, objectName, buffer, buffer.length, {
    'Content-Type': contentType,
  });

  const base = config.minio.publicUrl.replace(/\/$/, '');
  return `${base}/${bucket}/${objectName}`;
}

/**
 * Build the public URL for an object already stored in MinIO, given its key.
 *
 * @param objectName  The key inside the bucket (e.g. "ask-gad/submissions/uuid.mp4")
 * @returns Public URL, or null if objectName is falsy.
 */
export function minioPublicUrl(objectName?: string | null): string | null {
  if (!objectName) return null;
  const base   = config.minio.publicUrl.replace(/\/$/, '');
  const bucket = config.minio.bucket;
  return `${base}/${bucket}/${objectName}`;
}

/**
 * Delete an object from MinIO by its object key.
 */
export async function deleteFromMinio(objectName: string): Promise<void> {
  try {
    await getMinioClient().removeObject(config.minio.bucket, objectName);
  } catch {
    // non-critical
  }
}

/**
 * Generate a presigned PUT URL so the browser can upload directly to MinIO
 * without routing the file bytes through the API server.
 *
 * @param objectName  The key inside the bucket (e.g. "videos/uuid.mp4")
 * @param expiresIn   Seconds until the URL expires (default 3 600 = 1 hour)
 * @returns { uploadUrl, fileUrl }
 */
export async function presignedPutMinio(
  objectName: string,
  expiresIn = 3600,
): Promise<{ uploadUrl: string; fileUrl: string }> {
  const client = getMinioClient();
  const bucket  = config.minio.bucket;

  // MinIO SDK presignedPutObject returns the upload URL
  const uploadUrl = await client.presignedPutObject(bucket, objectName, expiresIn);

  const base    = config.minio.publicUrl.replace(/\/$/, '');
  const fileUrl = `${base}/${bucket}/${objectName}`;

  return { uploadUrl, fileUrl };
}
