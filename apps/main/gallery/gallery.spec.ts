import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

test('gallery cells', async ({ page }, testInfo) => {
	const smoke = testInfo.project.ignoreSnapshots && !process.env.CI;
	if (!smoke && process.platform !== 'linux') {
		throw new Error(
			'Gallery comparison requires Linux. CI is the only baseline writer. Use --ignore-snapshots for a local smoke shoot.'
		);
	}
	if (testInfo.project.ignoreSnapshots && process.env.CI)
		throw new Error('CI must compare gallery baselines.');
	if (!smoke && testInfo.config.updateSnapshots !== 'none' && !process.env.CI) {
		throw new Error('CI is the only gallery baseline writer.');
	}
	await page.goto('/gallery');
	const links = page.locator('[data-gallery-component]');
	await expect(links.first()).toBeVisible();
	const components = await links.evaluateAll((nodes) =>
		nodes.map((node) => node.getAttribute('data-gallery-component')!)
	);
	// One test shoots every page: the budget grows with the inventory, a minute a
	// page and theme (its isolated cells included), so a new component never trips
	// a fixed clock.
	test.setTimeout(components.length * 2 * 60_000);
	let count = 0;
	const shot = new Set<string>();
	const shoot = async (id: string, theme: string) => {
		const cell = page.getByTestId(id);
		if (smoke)
			await cell.screenshot({ animations: 'disabled', caret: 'hide' }); // Buffer only; no Mac PNGs.
		else await expect(cell).toHaveScreenshot(`${id}-${theme}.png`);
		shot.add(`${id}-${theme}-linux.png`);
		count++;
	};
	for (const component of components) {
		for (const theme of ['light', 'dark']) {
			await page.goto(`/gallery/${component}?theme=${theme}`);
			const cells = page.locator('[data-cell-id]');
			await expect(cells.first()).toBeVisible();
			const ids = await cells.evaluateAll((nodes) =>
				nodes.map((node) => ({
					id: node.getAttribute('data-cell-id')!,
					isolated: node.getAttribute('data-isolated') === 'true',
				}))
			);
			for (const { id, isolated } of ids) if (!isolated) await shoot(id, theme);
			// An isolated story (an open popover, select or dialog: it owns the document's
			// focus) is shot one cell per page, so its siblings cannot close or cover it.
			for (const { id, isolated } of ids) {
				if (!isolated) continue;
				await page.goto(`/gallery/${component}?theme=${theme}&cell=${id}`);
				await expect(page.getByTestId(id)).toBeVisible();
				await shoot(id, theme);
			}
		}
	}
	expect(count).toBeGreaterThan(0);
	if (!smoke && testInfo.config.updateSnapshots === 'none') {
		// The inventory is the baseline set: a story or component that silently disappears
		// leaves orphaned PNGs behind, and an orphan fails the job (review, roadmap#355).
		const onDisk = readdirSync(join(testInfo.project.testDir, 'gallery.spec.ts-snapshots'))
			.filter((name) => name.endsWith('.png'))
			.sort();
		expect(onDisk).toEqual([...shot].sort());
	}
	process.stdout.write(`Gallery cells found: ${count}\n`);
});
