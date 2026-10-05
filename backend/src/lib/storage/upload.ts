import { S3Client } from 'bun';
import { eventsConfig, type UploadDestination } from '../../config/events';
import { env } from '../../config/env';

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

function getFileExtension(fileName: string, mimeType: string): string {
  const fromName = fileName.includes('.')
    ? fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
    : '';

  if (fromName) return fromName;

  switch (mimeType) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    default:
      return '';
  }
}

function createS3Client() {
  return new S3Client({
    accessKeyId: env.s3AccessKey,
    secretAccessKey: env.s3SecretKey,
    bucket: env.s3Bucket,
    endpoint: env.s3PublicUrl,
  });
}

export function isAllowedUploadDestination(
  dest: string,
): dest is UploadDestination {
  return (eventsConfig.uploadDestinations as readonly string[]).includes(dest);
}

export async function uploadImage(
  dest: UploadDestination,
  file: File,
): Promise<{ url: string; key: string }> {
  if (!IMAGE_MIME_TYPES.has(file.type)) {
    throw new Error('Only image files are allowed');
  }

  const extension = getFileExtension(file.name, file.type);
  const key = `${dest}/${crypto.randomUUID()}${extension}`;
  const client = createS3Client();

  await client.write(key, file, { type: file.type });

  const publicBase = env.s3PublicUrl.replace(/\/$/, '');
  return {
    key,
    url: `${publicBase}/${env.s3Bucket}/${key}`,
  };
}

export function deleteImage(key: string): Promise<void> {
  const client = createS3Client();
  return client.delete(key);
}
