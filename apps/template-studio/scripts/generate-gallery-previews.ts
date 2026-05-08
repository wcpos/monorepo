import './install-dom-parser';

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium } from 'playwright';

import type { ReceiptData } from '@wcpos/printer/encoder';

import { createRandomReceipt } from '../src/randomizer';
import { renderStudioTemplate } from '../src/studio-core';
import { listBundledTemplates } from '../src/template-loader';
import { galleryPreviewOutputDir, galleryTemplatesDir, studioRoot } from './studio-paths';

import type { PaperWidth, ReceiptFixture, TemplateEngine } from '../src/studio-core';

const checkMode = process.argv.includes('--check');
const paperClass: Record<PaperWidth, string> = {
	'58mm': 'thermal-58',
	'80mm': 'thermal-80',
	a4: 'a4',
};
const coffeeMonsterLogoUrl = '/coffee-monster.png';
const coffeeMonsterLogoPath = path.join(studioRoot, 'public/coffee-monster.png');
export type GalleryFixture = ReceiptData & { id: string };

// Stable seed + curated edge cases keeps the gallery previews deterministic across runs while
// still showing enough fields for the template gallery to look like the interactive Studio preview.
export function buildGalleryFixture(): GalleryFixture {
	const random = createRandomReceipt({
		seed: 'gallery-default-receipt',
		overrides: {
			emptyCart: false,
			refund: false,
			rtl: false,
			multicurrency: false,
			multiPayment: true,
			fiscal: true,
			longNames: false,
			hasDiscounts: true,
			hasFees: true,
			hasShipping: true,
			cartSize: 3,
		},
	});
	const fixture: GalleryFixture = {
		...random.data,
		id: 'gallery-default-receipt',
		store: {
			...random.data.store,
			name: 'Coffee Monster',
			logo: coffeeMonsterLogoUrl,
		},
	};
	return fixture;
}

function viewportForPaperWidth(paperWidth: PaperWidth): { width: number; height: number } {
	if (paperWidth === 'a4') return { width: 900, height: 1300 };
	return { width: 480, height: 720 };
}

export function resolveGalleryPaperWidth(template: {
	engine: TemplateEngine;
	paperWidth?: PaperWidth | null;
}): PaperWidth {
	return template.paperWidth ?? (template.engine === 'thermal' ? '80mm' : 'a4');
}

export function pageHtml(renderedHtml: string, paperWidth: PaperWidth): string {
	return `<!doctype html><html><head><meta charset="utf-8"><base href="https://studio.local/"><style>
:root{--ts-stage:#efe9dd;--ts-paper:#ffffff;--ts-mono:'SF Mono','Cascadia Code','Roboto Mono',Consolas,'Courier New',monospace;--ts-shadow-paper:0 2px 4px rgba(40,32,22,.08),0 18px 40px rgba(40,32,22,.12)}
*{box-sizing:border-box}
body{margin:0;background:var(--ts-stage);padding:32px;display:grid;place-items:start center;min-width:100vw;min-height:100vh}
.paper-frame{background:var(--ts-paper);box-shadow:var(--ts-shadow-paper);font-family:var(--ts-mono);color:#1c1814;transform-origin:top center}
.paper-frame.thermal-58{width:58mm}
.paper-frame.thermal-80{width:80mm}
.paper-frame.a4{width:210mm;min-height:297mm}
.paper-frame.thermal-58,.paper-frame.thermal-80{padding:4mm 2mm;font-size:11.5px}
.paper-frame.thermal-58>div,.paper-frame.thermal-80>div{box-shadow:none!important;margin:0!important;padding:0!important;background:transparent!important;width:100%!important}
.paper-frame.thermal-58>div{font-size:10.5px!important}
.paper-frame.thermal-80>div{font-size:10px!important}
.paper-frame :is(table,tr,td,th){color:inherit}
table{max-width:100%}
img{max-width:100%}
</style></head><body><main class="paper-frame ${paperClass[paperWidth]}">${renderedHtml}</main></body></html>`;
}

async function main() {
	const fixture: ReceiptFixture = buildGalleryFixture();
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
		await page.route('https://studio.local/coffee-monster.png', async (route) => {
			await route.fulfill({
				contentType: 'image/png',
				body: await fs.readFile(coffeeMonsterLogoPath),
			});
		});
		for (const template of templates) {
			const paperWidth = resolveGalleryPaperWidth(template);
			await page.setViewportSize(viewportForPaperWidth(paperWidth));
			const rendered = renderStudioTemplate({
				template,
				fixture,
				paperWidth,
			});
			await page.setContent(pageHtml(rendered.html, paperWidth), { waitUntil: 'load' });
			const locator = page.locator('.paper-frame');
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

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
