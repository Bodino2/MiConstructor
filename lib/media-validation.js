const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const ALLOWED_AUDIO_TYPES = new Set(["audio/mpeg", "audio/mp4", "audio/ogg", "audio/webm"]);

export function validateUpload(file, kind) {
  if (!(file instanceof File) || file.size < 1) {
    return { valid: false, error: "Debes seleccionar un archivo válido." };
  }
  const rules = {
    image: { types: ALLOWED_IMAGE_TYPES, maxBytes: 10 * 1024 * 1024 },
    evidence: {
      types: new Set([...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES]),
      maxBytes: file.type.startsWith("video/") ? 100 * 1024 * 1024 : 10 * 1024 * 1024,
    },
    audio: { types: ALLOWED_AUDIO_TYPES, maxBytes: 20 * 1024 * 1024 },
    pdf: { types: new Set(["application/pdf"]), maxBytes: 15 * 1024 * 1024 },
  };
  const rule = rules[kind];
  if (!rule || !rule.types.has(file.type)) {
    return { valid: false, error: "El formato del archivo no está permitido." };
  }
  if (file.size > rule.maxBytes) {
    return { valid: false, error: "El archivo supera el tamaño máximo permitido." };
  }
  return { valid: true, maxBytes: rule.maxBytes };
}

export function safeObjectExtension(contentType) {
  return {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/ogg": "ogg",
    "audio/webm": "webm",
    "application/pdf": "pdf",
  }[contentType] ?? "bin";
}
