import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const studioRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export const monorepoRoot = path.resolve(studioRoot, '../..');
export const defaultWooCommercePosRoot = monorepoRoot.includes(`${path.sep}.worktrees${path.sep}`)
	? path.resolve(monorepoRoot, '../../..', 'woocommerce-pos')
	: path.resolve(monorepoRoot, '../woocommerce-pos');
export const wooCommercePosRoot = process.env.WCPOS_PLUGIN_ROOT ?? defaultWooCommercePosRoot;
export const galleryTemplatesDir =
	process.env.WCPOS_GALLERY_TEMPLATES_DIR ?? path.join(wooCommercePosRoot, 'templates/gallery');
export const galleryPreviewOutputDir =
	process.env.WCPOS_GALLERY_PREVIEW_DIR ?? path.join(studioRoot, 'gallery-previews');
export const fixturesDir = path.join(studioRoot, 'fixtures');
export const curatedSnapshotDir = path.join(studioRoot, 'snapshots/curated');
