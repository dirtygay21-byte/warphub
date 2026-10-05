export const fullS3Url = `${import.meta.env.VITE_S3_BASE_URL}/${import.meta.env.VITE_S3_BUCKET_NAME}`;

export const s3Url = (object: string) => {
  return `${fullS3Url}/${object}`;
};