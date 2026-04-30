// @vitest-environment node
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveDefaultWooCommercePosRoot } from '../../scripts/studio-paths';

describe('template studio path defaults', () => {
	it('resolves the sibling plugin checkout from a normal monorepo checkout', () => {
		expect(resolveDefaultWooCommercePosRoot('/workspace/wcpos/monorepo-v2')).toBe(
			path.normalize('/workspace/wcpos/woocommerce-pos')
		);
	});

	it('resolves the sibling plugin checkout from a monorepo worktree checkout', () => {
		expect(
			resolveDefaultWooCommercePosRoot(
				'/workspace/wcpos/monorepo-v2/.worktrees/template-studio-print-lab'
			)
		).toBe(path.normalize('/workspace/wcpos/woocommerce-pos'));
	});
});
