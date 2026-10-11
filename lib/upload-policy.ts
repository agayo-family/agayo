export type UploadPurpose = "poster" | "photo" | "audio" | "loyalty" | "organizer";
const imageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
export const uploadPolicies = {
  poster: { maximumSizeInBytes: 12 * 1024 * 1024, allowedContentTypes: imageTypes },
  photo: { maximumSizeInBytes: 16 * 1024 * 1024, allowedContentTypes: imageTypes },
  audio: { maximumSizeInBytes: 30 * 1024 * 1024, allowedContentTypes: ["audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav", "audio/ogg", "audio/webm", "audio/aac", "audio/flac"] },
  loyalty: { maximumSizeInBytes: 10 * 1024 * 1024, allowedContentTypes: imageTypes },
  organizer: { maximumSizeInBytes: 8 * 1024 * 1024, allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"] },
} as const;

export function isUploadPurpose(value: unknown): value is UploadPurpose {
  return typeof value === "string" && Object.hasOwn(uploadPolicies, value);
}

export function isUploadPathAllowed(path: string, purpose: UploadPurpose) {
  const prefix = `agayo/uploads/${purpose}/`;
  return path.startsWith(prefix) && /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]{1,8}$/.test(path.slice(prefix.length)) && path.length <= 250;
}

export function assertUploadFile(file: { size: number; type: string }, purpose: UploadPurpose) {
  const policy = uploadPolicies[purpose];
  if (!Number.isFinite(file.size) || file.size <= 0) throw new Error("Файл пустой или повреждён");
  if (file.size > policy.maximumSizeInBytes) throw new Error(`Файл больше ${policy.maximumSizeInBytes / 1024 / 1024} МБ`);
  if (!(policy.allowedContentTypes as readonly string[]).includes(file.type)) throw new Error(purpose === "audio" ? "Выбери MP3, M4A, WAV, OGG или WebM" : "Выбери JPG, PNG, WEBP, GIF или AVIF");
}
