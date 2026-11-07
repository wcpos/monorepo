// The capture manifest: one page and locale directory of images, with a manifest.json beside them
// carrying the run, the device matrix and the pinned testID boxes (rulings roadmap#521 and #522).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

export interface CapturePin {
	testID: string;
	box: { x: number; y: number; width: number; height: number };
}

export interface CaptureEntry {
	file: string;
	step: number;
	slug: string;
	device: string;
	colorScheme: string;
	scale: string;
	store: string;
	variant: string;
	viewport: { width: number; height: number };
	pins: CapturePin[];
}

export interface CaptureManifest {
	runId: string;
	commit: string;
	date: string;
	journey: string;
	page: string;
	locale: string;
	captures: CaptureEntry[];
}

/**
 * Each testID's box in CSS pixels, recorded only when a reader can see it: its centre lies in
 * the viewport and the element drawn there is the target, inside it or an ancestor of it.
 * Playwright's `visible` alone passes a phone's hidden tab or a closed drawer's items.
 */
export async function readPins(page: Page, testIDs: readonly string[]): Promise<CapturePin[]> {
	const pins: CapturePin[] = [];
	const viewport = page.viewportSize();
	for (const testID of testIDs) {
		const target = page.getByTestId(testID).filter({ visible: true }).first();
		// Counted first: `boundingBox` would wait out the action timeout for a missing element.
		const box = (await target.count()) ? await target.boundingBox() : null;
		if (!box) continue;
		const cx = box.x + box.width / 2;
		const cy = box.y + box.height / 2;
		if (!viewport || cx < 0 || cy < 0 || cx >= viewport.width || cy >= viewport.height) continue;
		const onTop = await target.evaluate(
			(element, [x, y]) => {
				const hit = document.elementFromPoint(x, y);
				return !!hit && (element.contains(hit) || hit.contains(element));
			},
			[cx, cy]
		);
		if (!onTop) continue;
		const [x, y, width, height] = [box.x, box.y, box.width, box.height].map(Math.round);
		pins.push({ testID, box: { x, y, width, height } });
	}
	return pins;
}

/** Copy the image into its page and locale directory and record its entry in the manifest. */
export function recordCapture(args: {
	journey: string;
	docsPage: string;
	locale: string;
	outputDir: string;
	imagePath: string;
	entry: Omit<CaptureEntry, 'file'>;
}): void {
	const page = args.docsPage.replace(/\/index\.mdx$/, '');
	const dir = path.join(args.outputDir, 'captures', page, args.locale);
	fs.mkdirSync(dir, { recursive: true });
	const file = path.basename(args.imagePath);

	// Read-modify-write without a lock: captures run at one worker.
	const manifestPath = path.join(dir, 'manifest.json');
	const existing: CaptureManifest | null = fs.existsSync(manifestPath)
		? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
		: null;
	// Filenames carry no variant and published pages depend on them, so a second variant of the
	// same image would silently replace the first; refuse it before the copy.
	const clash = existing?.captures.find(
		(capture) =>
			capture.file === file &&
			(capture.variant !== args.entry.variant || capture.store !== args.entry.store)
	);
	if (clash) {
		throw new Error(
			`${file} is already recorded for ${clash.variant} on ${clash.store}; one manifest holds one variant of an image`
		);
	}
	fs.copyFileSync(args.imagePath, path.join(dir, file));
	const now = new Date();
	const manifest: CaptureManifest = {
		runId: existing?.runId ?? `capture-${now.toISOString().replace(/[-:]|\.\d{3}Z$/g, '')}`,
		commit:
			existing?.commit ??
			process.env.GITHUB_SHA ??
			execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
		date: existing?.date ?? now.toISOString(),
		journey: args.journey,
		page: args.docsPage,
		locale: args.locale,
		captures: [
			...(existing?.captures ?? []).filter((capture) => capture.file !== file),
			{ file, ...args.entry },
		].sort((a, b) => a.file.localeCompare(b.file)),
	};
	fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
