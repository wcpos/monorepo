import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const studioRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export const monorepoRoot = path.resolve(studioRoot, '../..');

/**
 * Resolve the default woocommerce-pos plugin checkout path for a Template Studio checkout.
 *
 * Template Studio can run from the primary monorepo checkout or from a git worktree
 * under `.worktrees`; this keeps the default pointing at the sibling plugin checkout
 * in both layouts.
 */
export function resolveDefaultWooCommercePosRoot(root: string): string {
	const resolvedRoot = path.resolve(root);
	return resolvedRoot.includes(`${path.sep}.worktrees${path.sep}`)
		? path.resolve(resolvedRoot, '../../..', 'woocommerce-pos')
		: path.resolve(resolvedRoot, '../woocommerce-pos');
}

export const defaultWooCommercePosRoot = resolveDefaultWooCommercePosRoot(monorepoRoot);
export const wooCommercePosRoot = process.env.WCPOS_PLUGIN_ROOT ?? defaultWooCommercePosRoot;
export const galleryTemplatesDir =
	process.env.WCPOS_GALLERY_TEMPLATES_DIR ?? path.join(wooCommercePosRoot, 'templates/gallery');
export const galleryPreviewOutputDir =
	process.env.WCPOS_GALLERY_PREVIEW_DIR ?? path.join(studioRoot, 'gallery-previews');
export const curatedSnapshotDir = path.join(studioRoot, 'snapshots/curated');
