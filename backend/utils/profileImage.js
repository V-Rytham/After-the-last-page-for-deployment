import fs from 'fs/promises';
import path from 'path';

const UPLOAD_DIR = path.resolve(process.cwd(), 'backend', 'uploads', 'profiles');
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;

export const profileImageConfig = {
  uploadDir: UPLOAD_DIR,
  maxSizeBytes: MAX_UPLOAD_SIZE_BYTES,
  allowedMimeTypes: ALLOWED_TYPES,
};

export const ensureProfileUploadDir = async () => {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
};

export const safeUnlink = async (absolutePath) => {
  if (!absolutePath) {
    return;
  }

  try {
    await fs.unlink(absolutePath);
  } catch {
    // intentionally ignored
  }
};

export const getImagePublicUrl = (req, relativePath) => {
  if (!relativePath) {
    return '';
  }

  if (/^https?:\/\//i.test(relativePath)) {
    return relativePath;
  }

  const normalized = String(relativePath).startsWith('/') ? relativePath : `/${relativePath}`;
  const configuredOrigin = String(process.env.PUBLIC_SERVER_URL || '').trim();
  if (configuredOrigin) {
    return `${configuredOrigin.replace(/\/$/, '')}${normalized}`;
  }

  return `${req.protocol}://${req.get('host')}${normalized}`;
};
