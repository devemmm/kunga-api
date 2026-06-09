/**
 * Cloudflare R2 presigned URL helper (S3-compatible API)
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/index.js';

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (_client) return _client;
  const { accountId, r2AccessKey, r2SecretKey } = config.cloudflare;
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: r2AccessKey,
      secretAccessKey: r2SecretKey,
    },
  });
  return _client;
}

/**
 * Generate a presigned PUT URL for a direct browser upload to R2.
 * @param key      Object key inside the bucket, e.g. "resources/abc123.pdf"
 * @param contentType  MIME type of the file being uploaded
 * @param expiresIn    Seconds until the URL expires (default 900 = 15 min)
 */
export async function presignedPut(key: string, contentType: string, expiresIn = 900): Promise<string> {
  const { r2Bucket, r2AccessKey, accountId } = config.cloudflare;

  // Guard: fail fast with a clear message if R2 credentials are missing or still placeholder values
  const isPlaceholder = (v: string) => !v || v.startsWith('your-');
  if (isPlaceholder(r2AccessKey) || isPlaceholder(accountId)) {
    throw Object.assign(
      new Error('File storage is not configured. Add CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY, CLOUDFLARE_R2_SECRET_KEY and CLOUDFLARE_R2_BUCKET to your backend .env file.'),
      { status: 503, code: 'R2_NOT_CONFIGURED' }
    );
  }

  const command = new PutObjectCommand({
    Bucket: r2Bucket,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(getClient(), command, { expiresIn });
}

/**
 * Build the public (CDN) URL for a given key after it has been uploaded.
 */
export function publicUrl(key: string): string {
  const base = config.cloudflare.r2PublicUrl || `https://pub-${config.cloudflare.accountId}.r2.dev`;
  return `${base.replace(/\/$/, '')}/${key}`;
}
