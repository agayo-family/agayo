export function resolveBlobToken() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  if (process.env.agayo_BLOB_READ_WRITE_TOKEN) return process.env.agayo_BLOB_READ_WRITE_TOKEN;
  const discovered = Object.entries(process.env).find(([key, value]) => key.endsWith("_BLOB_READ_WRITE_TOKEN") && Boolean(value));
  return discovered?.[1];
}
