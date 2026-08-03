// =====================================================================
// prepareEvidenceImage — memory-safe capture pipeline for damage
// evidence. iPhone cameras return 12–48 MP HEIC/JPEG; loading those into
// a Base64 string in React state jettisons the WKWebView (the reported
// crash). Instead we decode, downscale to a safe max dimension, and
// re-encode to a compact JPEG Blob, exposing an object-URL preview
// (never a full-resolution Base64 string) that the caller revokes.
//
// HEIC/HEIF: modern iOS WKWebView can decode HEIC via createImageBitmap /
// <img>; the canvas re-encode always outputs JPEG, so the stored + shown
// image is universally renderable. If decoding genuinely fails, we throw
// a typed error so the UI can show friendly copy instead of crashing.
// =====================================================================

export const MAX_EVIDENCE_DIMENSION = 2048; // px, longest side
export const EVIDENCE_JPEG_QUALITY = 0.85;

export type PreparedImage = {
  /** Compressed JPEG to upload. */
  file: File;
  /** Object URL for preview — the CALLER must revoke it on remove/unmount. */
  previewUrl: string;
  width: number;
  height: number;
};

export type PrepareErrorKind = 'unsupported' | 'decode' | 'encode';
export class PrepareImageError extends Error {
  kind: PrepareErrorKind;
  constructor(kind: PrepareErrorKind) {
    super(kind);
    this.kind = kind;
  }
}

function fitWithin(w: number, h: number, max: number): { width: number; height: number } {
  if (w <= max && h <= max) return { width: w, height: h };
  const scale = max / Math.max(w, h);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** Decode a file to an <img> via an object URL (fallback decoder). */
function decodeViaImg(file: File): Promise<{ el: HTMLImageElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => resolve({ el, url });
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new PrepareImageError('decode'));
    };
    el.src = url;
  });
}

type Drawable = { source: CanvasImageSource; width: number; height: number; cleanup: () => void };

async function decode(file: File): Promise<Drawable> {
  // Prefer createImageBitmap (handles EXIF orientation on modern engines,
  // decodes off the main thread). Fall back to <img>.
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      return { source: bmp, width: bmp.width, height: bmp.height, cleanup: () => bmp.close?.() };
    } catch {
      /* fall through to <img> */
    }
  }
  const { el, url } = await decodeViaImg(file);
  return {
    source: el,
    width: el.naturalWidth,
    height: el.naturalHeight,
    cleanup: () => URL.revokeObjectURL(url),
  };
}

function renameToJpg(name: string): string {
  const base = (name || 'evidence').replace(/\.[^.]*$/, '').slice(0, 60) || 'evidence';
  return `${base}.jpg`;
}

/** Decode → downscale ≤MAX → JPEG @QUALITY. Throws PrepareImageError. */
export async function prepareEvidenceImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) throw new PrepareImageError('unsupported');

  const drawable = await decode(file);
  try {
    if (!drawable.width || !drawable.height) throw new PrepareImageError('decode');
    const { width, height } = fitWithin(drawable.width, drawable.height, MAX_EVIDENCE_DIMENSION);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new PrepareImageError('encode');
    ctx.drawImage(drawable.source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', EVIDENCE_JPEG_QUALITY),
    );
    if (!blob) throw new PrepareImageError('encode');
    return {
      file: new File([blob], renameToJpg(file.name), { type: 'image/jpeg' }),
      previewUrl: URL.createObjectURL(blob),
      width,
      height,
    };
  } finally {
    drawable.cleanup();
  }
}
