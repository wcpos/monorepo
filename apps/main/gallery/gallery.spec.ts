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
	let count = 0;
	const shot = new Set<string>();
	for (const component of components) {
		for (const theme of ['light', 'dark']) {
			await page.goto(`/gallery/${component}?theme=${theme}`);
			const cells = page.locator('[data-cell-id]');
			await expect(cells.first()).toBeVisible();
			const ids = await cells.evaluateAll((nodes) =>
				nodes.map((node) => node.getAttribute('data-cell-id')!)
			);
			for (const id of ids) {
				const cell = page.getByTestId(id);
				if (smoke)
					await cell.screenshot({ animations: 'disabled', caret: 'hide' }); // Buffer only; no Mac PNGs.
				else await expect(cell).toHaveScreenshot(`${id}-${theme}.png`);
				shot.add(`${id}-${theme}-linux.png`);
				if (/^v2-dialog--(page|right|phone-center)--regular-coarse$/.test(id)) {
					// DIAG (#2200): the page cell renders collapsed on Linux only; dump its layout chain.
					const dump = await cell.evaluate((el) => {
						const box = (n: Element) => {
							const r = n.getBoundingClientRect();
							return `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.left)},${Math.round(r.top)}`;
						};
						const chain: unknown[] = [];
						let n: Element | null = el.querySelector('input') ?? el.querySelector('[role="dialog"]');
						for (let i = 0; n && i < 12; i++) {
							const cs = getComputedStyle(n);
							chain.push({ tag: n.tagName, cls: (n.getAttribute('class') ?? '').slice(0, 200), box: box(n), disp: cs.display, pos: cs.position, flex: cs.flex, h: cs.height, w: cs.width, ov: cs.overflowY, vis: cs.visibility, op: cs.opacity, tr: cs.transform });
							n = n.parentElement;
						}
						return { ua: navigator.userAgent, html: el.outerHTML.slice(0, 14000), chain };
					});
					await testInfo.attach(`${id}-${theme}.json`, { body: JSON.stringify(dump, null, 1), contentType: 'application/json' });
					const shotA = await cell.screenshot({ animations: 'disabled', caret: 'hide' });
					await testInfo.attach(`${id}-${theme}-A-disabled.png`, { body: shotA, contentType: 'image/png' });
					await page.waitForTimeout(1500);
					const shotB = await cell.screenshot({ animations: 'allow', caret: 'hide' });
					await testInfo.attach(`${id}-${theme}-B-allow-after-1500ms.png`, { body: shotB, contentType: 'image/png' });
					const anims = await cell.evaluate((el) => el.getAnimations({ subtree: true }).map((a) => `${(a as CSSAnimation).animationName ?? a.id}:${a.playState}:${a.currentTime}`));
					await testInfo.attach(`${id}-${theme}-animations.txt`, { body: anims.join('\n') || '(none)', contentType: 'text/plain' });
					await cell.evaluate((el) => el.getAnimations({ subtree: true }).forEach((a) => a.finish()));
					const shotC = await cell.screenshot({ animations: 'disabled', caret: 'hide' });
					await testInfo.attach(`${id}-${theme}-C-finished-then-disabled.png`, { body: shotC, contentType: 'image/png' });
				}
				count++;
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
