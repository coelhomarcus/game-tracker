import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import sharp from 'sharp';
import { AppError } from './errors';
import { getPublicBaseUrl } from './publicUrl';

const AVATARS_DIR = path.join(process.cwd(), 'uploads', 'avatars');
const BANNERS_DIR = path.join(process.cwd(), 'uploads', 'banners');
fs.mkdirSync(AVATARS_DIR, { recursive: true });
const POSTS_DIR = path.join(process.cwd(), 'uploads', 'posts');
fs.mkdirSync(BANNERS_DIR, { recursive: true });
fs.mkdirSync(POSTS_DIR, { recursive: true });

const imageUploadOptions = {
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Arquivo precisa ser uma imagem'));
      return;
    }
    cb(null, true);
  },
};

export const avatarUpload = multer(imageUploadOptions);
export const bannerUpload = multer(imageUploadOptions);
export const postImageUpload = multer(imageUploadOptions);

/**
 * O MIME vem do cliente e não prova nada: bytes corrompidos com `image/png` chegam até aqui e
 * o sharp lança. Isso é erro do arquivo enviado (400), não falha do servidor (500).
 */
async function processImage(buffer: Buffer, width: number, height: number, filepath: string) {
  try {
    await sharp(buffer).resize(width, height, { fit: 'cover' }).jpeg({ quality: 85 }).toFile(filepath);
  } catch {
    throw new AppError(400, 'validation_error', 'Imagem inválida ou corrompida');
  }
}

/** Redimensiona/comprime e salva o avatar; devolve o path relativo (ex: /uploads/avatars/xxx.jpg). */
export async function saveAvatar(buffer: Buffer): Promise<string> {
  const filename = `${crypto.randomUUID()}.jpg`;
  const filepath = path.join(AVATARS_DIR, filename);

  await processImage(buffer, 400, 400, filepath);

  return `/uploads/avatars/${filename}`;
}

/** Redimensiona/comprime e salva o banner (3:1, como o do X); devolve o path relativo. */
export async function saveBanner(buffer: Buffer): Promise<string> {
  const filename = `${crypto.randomUUID()}.jpg`;
  const filepath = path.join(BANNERS_DIR, filename);

  await processImage(buffer, 1500, 500, filepath);

  return `/uploads/banners/${filename}`;
}

/** Maior lado, em px, de uma imagem de post (nunca é ampliada). */
const POST_IMAGE_MAX_SIDE = 2000;
const POST_IMAGES_URL_PATH = '/uploads/posts/';
const POST_IMAGE_FILENAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;

/**
 * Salva uma imagem de post: respeita a rotação do EXIF, cabe em 2000x2000 mantendo a proporção,
 * vira JPEG e perde os metadados (o sharp os descarta por padrão, GPS incluído). Devolve o path
 * relativo e o tamanho final.
 */
export async function savePostImage(buffer: Buffer): Promise<{ path: string; width: number; height: number }> {
  const filename = `${crypto.randomUUID()}.jpg`;
  try {
    const info = await sharp(buffer)
      .rotate()
      .resize({ width: POST_IMAGE_MAX_SIDE, height: POST_IMAGE_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(path.join(POSTS_DIR, filename));
    return { path: `${POST_IMAGES_URL_PATH}${filename}`, width: info.width, height: info.height };
  } catch {
    throw new AppError(400, 'validation_error', 'Imagem inválida ou corrompida');
  }
}

/** O nome do arquivo de uma URL emitida por `savePostImage` nesta API, ou `null` para qualquer outra. */
function issuedPostImageFilename(url: string): string | null {
  const prefix = `${getPublicBaseUrl()}${POST_IMAGES_URL_PATH}`;
  if (!url.startsWith(prefix)) return null;
  const filename = url.slice(prefix.length);
  return POST_IMAGE_FILENAME.test(filename) ? filename : null;
}

/**
 * Confere se `url` é de uma imagem que esta API emitiu e que ainda existe, e devolve o tamanho
 * real do arquivo (o que o cliente informa não é confiável). `null` se não for.
 */
export async function inspectIssuedPostImage(url: string): Promise<{ width: number; height: number } | null> {
  const filename = issuedPostImageFilename(url);
  if (!filename) return null;
  try {
    const { width, height } = await sharp(path.join(POSTS_DIR, filename)).metadata();
    return width && height ? { width, height } : null;
  } catch {
    return null;
  }
}

/** Best-effort: apaga o arquivo de uma imagem de post emitida por esta API. */
export async function deletePostImageIfLocal(url: string) {
  const filename = issuedPostImageFilename(url);
  if (!filename) return;
  try {
    await fs.promises.unlink(path.join(POSTS_DIR, filename));
  } catch {
    // arquivo pode já não existir — não é crítico
  }
}

async function deleteIfLocal(url: string | null, dir: string, marker: string) {
  if (!url) return;
  const index = url.indexOf(marker);
  if (index === -1) return;

  const filename = url.slice(index + marker.length);
  try {
    await fs.promises.unlink(path.join(dir, filename));
  } catch {
    // arquivo pode já não existir — não é crítico
  }
}

/** Best-effort: apaga um avatar antigo quando o usuário troca de foto. */
export function deleteAvatarIfLocal(avatarUrl: string | null) {
  return deleteIfLocal(avatarUrl, AVATARS_DIR, '/uploads/avatars/');
}

/** Best-effort: apaga um banner antigo quando o usuário troca de capa. */
export function deleteBannerIfLocal(bannerUrl: string | null) {
  return deleteIfLocal(bannerUrl, BANNERS_DIR, '/uploads/banners/');
}
