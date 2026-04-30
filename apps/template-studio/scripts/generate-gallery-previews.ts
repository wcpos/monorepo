import './install-dom-parser';

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from 'playwright';

import { type ReceiptFixture, renderStudioTemplate } from '../src/studio-core';
import { listBundledTemplates } from '../src/template-loader';
import { fixturesDir, galleryPreviewOutputDir, galleryTemplatesDir } from './studio-paths';

const checkMode = process.argv.includes('--check');
const fixturePath = path.join(fixturesDir, 'gallery-default-receipt.json');

function pageHtml(renderedHtml: string): string {
	return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#eef2f6;padding:24px;width:360px;box-sizing:border-box}.preview{background:white;box-shadow:0 12px 32px rgba(15,23,42,.18);border-radius:12px;overflow:hidden;min-height:420px;display:flex;align-items:flex-start;justify-content:center;padding:16px;box-sizing:border-box}table{max-width:100%}</style></head><body><main class="preview">${renderedHtml}</main></body></html>`;
}

async function main() {
	const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8')) as ReceiptFixture;
	const templates = await listBundledTemplates({
		templatesDir: pathToFileURL(galleryTemplatesDir),
	});
	const expectedOutputs = new Set(templates.map((template) => `${template.id}.png`));
	await fs.mkdir(galleryPreviewOutputDir, { recursive: true });
	const browser = await chromium.launch();
	const stale: string[] = [];
	const written: string[] = [];

	try {
		const page = await browser.newPage({
			viewport: { width: 360, height: 520 },
			deviceScaleFactor: 1,
		});
		for (const template of templates) {
			const rendered = renderStudioTemplate({
				template,
				fixture,
				paperWidth: template.paperWidth ?? '80mm',
			});
			await page.setContent(pageHtml(rendered.html), { waitUntil: 'load' });
			const locator = page.locator('.preview');
			const image = await locator.screenshot({ type: 'png' });
			const outputPath = path.join(galleryPreviewOutputDir, `${template.id}.png`);
			let current: Buffer | undefined;
			try {
				current = await fs.readFile(outputPath);
			} catch {
				/* new image */
			}
			if (!current || !current.equals(image)) {
				if (checkMode) stale.push(path.relative(process.cwd(), outputPath));
				else {
					await fs.writeFile(outputPath, image);
					written.push(path.relative(process.cwd(), outputPath));
				}
			}
		}
		if (checkMode) {
			const existingOutputs = (await fs.readdir(galleryPreviewOutputDir)).filter((file) =>
				file.endsWith('.png')
			);
			for (const outputFile of existingOutputs) {
				if (!expectedOutputs.has(outputFile)) {
					stale.push(path.relative(process.cwd(), path.join(galleryPreviewOutputDir, outputFile)));
				}
			}
		}
	} finally {
		await browser.close();
	}

	if (stale.length > 0) {
		throw new Error(
			`Gallery preview images are stale:\n${stale.join('\n')}\nRun pnpm generate:gallery-previews to refresh.`
		);
	}
	console.log(
		written.length > 0
			? `Generated ${written.length} gallery previews in ${galleryPreviewOutputDir}.`
			: 'Gallery preview images are current.'
	);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
