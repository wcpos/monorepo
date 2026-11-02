import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planFor } from './ci-plan.mjs';

for (const file of [
	'packages/components/src/button/index.tsx',
	'packages/core/src/screens/main/pos/index.tsx',
	'apps/main/global.css',
	'apps/main/app/(gallery)/gallery/index.tsx',
	'apps/main/components/gallery/cells.tsx',
	'apps/main/gallery/gallery.spec.ts',
	'apps/main/playwright.gallery.config.ts',
	'.github/workflows/test.yml',
]) {
	test(`gallery runs for ${file}`, () => assert.equal(planFor([file]).gallery, true));
}
for (const file of ['README.md', 'packages/database/src/index.ts', 'apps/main/e2e/auth.spec.ts']) {
	test(`gallery skips ${file}`, () => assert.equal(planFor([file]).gallery, false));
}
