/**
 * Генерация брендинга INPX Reader:
 * - public/brand/* — WebView fallback (navbar)
 * - assets/icon.png — launcher (из branding/icon-source.png)
 * - Android splash — trim lockup (системный слот API 31+ без иконки)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brandingDir = path.join(root, 'assets', 'branding');
const iconSource = path.join(brandingDir, 'icon-source.png');
const lockupSource = path.join(brandingDir, 'lockup-source.png');
const publicBrandDir = path.join(root, 'public', 'brand');
const assetsDir = path.join(root, 'assets');

const MIPMAP_SIZES = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

const LEGACY_SPLASH_FOLDERS = [
  'drawable',
  'drawable-port-mdpi',
  'drawable-port-hdpi',
  'drawable-port-xhdpi',
  'drawable-port-xxhdpi',
  'drawable-port-xxxhdpi',
  'drawable-land-mdpi',
  'drawable-land-hdpi',
  'drawable-land-xhdpi',
  'drawable-land-xxhdpi',
  'drawable-land-xxxhdpi',
];

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function removeLegacySplashPng(resRoot) {
  for (const folder of LEGACY_SPLASH_FOLDERS) {
    const file = path.join(resRoot, folder, 'splash.png');
    try {
      await fs.unlink(file);
    } catch {
      /* already removed */
    }
  }
}

/** Убирает однотонный фон вокруг lockup — иначе на сплеше виден прямоугольник. */
async function trimLockup(input) {
  return sharp(input).trim({ threshold: 12 }).png().toBuffer();
}

async function main() {
  await ensureDir(publicBrandDir);

  const icon1024 = await sharp(iconSource)
    .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const lockupTrimmed = await trimLockup(lockupSource);
  const lockupMeta = await sharp(lockupTrimmed).metadata();
  const lockupMaxH = 56;
  const lockupScale = lockupMaxH / lockupMeta.height;
  const lockupWeb = await sharp(lockupTrimmed)
    .resize(Math.round(lockupMeta.width * lockupScale), lockupMaxH)
    .png()
    .toBuffer();

  await fs.writeFile(path.join(publicBrandDir, 'app-icon.png'), icon1024);
  await fs.writeFile(path.join(publicBrandDir, 'lockup.png'), lockupWeb);
  await fs.writeFile(path.join(assetsDir, 'icon.png'), icon1024);

  const resRoot = path.join(root, 'android', 'app', 'src', 'main', 'res');
  await ensureDir(path.join(resRoot, 'drawable'));

  const splashLogo = await sharp(lockupTrimmed)
    .resize(560, null, { fit: 'inside' })
    .png()
    .toBuffer();
  await fs.writeFile(path.join(resRoot, 'drawable', 'splash_logo.png'), splashLogo);

  const legacyLaunchIcon = path.join(resRoot, 'drawable', 'splash_launch_icon.png');
  try {
    await fs.unlink(legacyLaunchIcon);
  } catch {
    /* already removed */
  }

  for (const [folder, size] of Object.entries(MIPMAP_SIZES)) {
    const dir = path.join(resRoot, `mipmap-${folder}`);
    await ensureDir(dir);
    const launcher = await sharp(icon1024).resize(size, size).png().toBuffer();
    await fs.writeFile(path.join(dir, 'ic_launcher.png'), launcher);
    await fs.writeFile(path.join(dir, 'ic_launcher_round.png'), launcher);
    await fs.writeFile(path.join(dir, 'ic_launcher_foreground.png'), launcher);
  }

  await removeLegacySplashPng(resRoot);

  console.log('Branding assets generated (trimmed lockup, no system splash icon).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
