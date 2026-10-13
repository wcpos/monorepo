import { existsSync } from 'node:fs';

import { wooCommercePosRoot } from '../../scripts/studio-paths';

// Only an absent, unconfigured local checkout is optional. Explicit paths,
// a present-but-broken checkout, and CI must exercise the loader and fail.
export const gallerySkipReason =
	!process.env.CI &&
	process.env.WCPOS_PLUGIN_ROOT === undefined &&
	process.env.WCPOS_GALLERY_TEMPLATES_DIR === undefined &&
	process.env.WCPOS_GALLERY_REGISTRY_PATH === undefined &&
	!existsSync(wooCommercePosRoot)
		? 'Plugin checkout absent: set WCPOS_GALLERY_TEMPLATES_DIR and WCPOS_GALLERY_REGISTRY_PATH'
		: undefined;

if (gallerySkipReason) console.warn(gallerySkipReason);
