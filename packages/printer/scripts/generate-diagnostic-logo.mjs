/**
 * Regenerates `src/encoder/diagnostic-logo.ts` from `assets/wcpos-mark.svg`.
 *
 *   pnpm --filter @wcpos/printer generate:diagnostic-logo
 *
 * Use that script rather than calling this file directly: installing the devDependencies
 * does not install Playwright's browser binary, and the script runs `playwright install
 * chromium` first (a no-op once it is present). Running the file directly on a clean
 * checkout fails at `chromium.launch()`.
 *
 * The diagnostic page prints the WCPOS mark to prove the `<image>` raster path
 * (asset load -> rasterize -> dither -> `GS v 0`) end to end. The bitmap is embedded
 * as a data URI rather than fetched, for three reasons:
 *
 *   1. A remote logo cannot be told apart from a broken printer. WordPress serves
 *      uploads without CORS headers, so a browser drops a cross-origin logo silently
 *      (README lessons log, 2026-09-03). An embedded mark always reaches the encoder,
 *      so a blank logo box means the *printer* failed — and a diagnostic that prints
 *      the WCPOS mark while a real receipt loses the store logo localises the fault
 *      to CORS rather than the hardware.
 *   2. A data URI takes the identical code path on every platform. `require()` of a
 *      PNG resolves to an asset reference under Metro, not bytes, and the rasterizers
 *      want bytes or a loadable src.
 *   3. Test prints run during printer setup, which is exactly when the network may
 *      not be configured yet.
 *
 * Encoding choices, each measured rather than assumed:
 *
 *   - Rendered at exactly DOT_WIDTH so nothing rescales at print time. Native
 *     rasterizes with `scaleNearest` (thermal-raster.native.ts), and nearest-neighbour
 *     resampling of a 1-bit mark at a non-integer ratio shreds the thin `pos` strokes.
 *   - Hard-thresholded to pure black/white here, so the printer's Atkinson dither pass
 *     has zero error to diffuse. Anti-aliased grey edges would otherwise come out as
 *     speckle on a 1-bit head.
 *   - Greyscale-8 PNG: 3x smaller than Chromium's RGBA output (1235 B vs 3651 B) and
 *     verified to decode identically under `upng-js`, which is what the native path uses.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Both are exact-pinned devDependencies of this package rather than floating ranges: these
// are the versions that produced the committed bitmap, so regenerating reproduces it byte
// for byte instead of quietly re-encoding it differently.
import { PNG } from 'pngjs';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, '..');
const SVG_PATH = path.join(PKG, 'assets', 'wcpos-mark.svg');
const OUT_PATH = path.join(PKG, 'src', 'encoder', 'diagnostic-logo.ts');

/**
 * 192 dots = 24 mm on the 8 dots/mm head every printer in the model table uses:
 * exactly half the printable width of 58 mm paper (384 dots) and a third of 80 mm
 * (576 dots), so it is never scaled down on the narrow lane.
 */
const DOT_WIDTH = 192;
/** Mid-grey split. The source mark is a solid silhouette, so nothing sits near the line. */
const THRESHOLD = 128;
/** The single fill colour in the source mark (WP admin grey), remapped to ink. */
const SOURCE_FILL = /#a7aaad/gi;

async function rasterize(svg, size) {
	let browser;
	try {
		browser = await chromium.launch();
	} catch (cause) {
		throw new Error(
			'Could not launch Chromium. Installing the devDependencies does not install the ' +
				'browser binary — run `pnpm --filter @wcpos/printer generate:diagnostic-logo`, ' +
				'which installs it first.',
			{ cause }
		);
	}
	try {
		const page = await browser.newPage();
		const dataUrl = await page.evaluate(
			async ({ svg, size, threshold }) => {
				const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
				const img = new Image();
				await new Promise((resolve, reject) => {
					img.onload = resolve;
					img.onerror = reject;
					img.src = url;
				});

				const canvas = document.createElement('canvas');
				canvas.width = size;
				canvas.height = size;
				const ctx = canvas.getContext('2d');
				// Flatten onto white: a thermal head has no alpha channel.
				ctx.fillStyle = '#fff';
				ctx.fillRect(0, 0, size, size);
				ctx.drawImage(img, 0, 0, size, size);

				const data = ctx.getImageData(0, 0, size, size);
				const px = data.data;
				for (let i = 0; i < px.length; i += 4) {
					const luminance = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
					const value = luminance >= threshold ? 255 : 0;
					px[i] = px[i + 1] = px[i + 2] = value;
					px[i + 3] = 255;
				}
				ctx.putImageData(data, 0, 0);
				URL.revokeObjectURL(url);
				return canvas.toDataURL('image/png');
			},
			{ svg, size, threshold: THRESHOLD }
		);
		return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
	} finally {
		await browser.close();
	}
}

function toGreyscalePng(rgbaPng) {
	const decoded = PNG.sync.read(rgbaPng);
	const grey = new PNG({
		width: decoded.width,
		height: decoded.height,
		colorType: 0,
		inputColorType: 6,
		bitDepth: 8,
	});
	decoded.data.copy(grey.data);
	return PNG.sync.write(grey, { colorType: 0, inputColorType: 6, deflateLevel: 9 });
}

function assertPureBlackAndWhite(png) {
	const { data } = PNG.sync.read(png);
	for (let i = 0; i < data.length; i += 4) {
		if (data[i] !== 0 && data[i] !== 255) {
			throw new Error(`Midtone ${data[i]} survived thresholding; the printer would dither it.`);
		}
	}
}

const svg = fs.readFileSync(SVG_PATH, 'utf8').replace(SOURCE_FILL, '#000000');
const png = toGreyscalePng(await rasterize(svg, DOT_WIDTH));
assertPureBlackAndWhite(png);

const base64 = png.toString('base64');
const source = `// GENERATED FILE — do not edit by hand.
// Regenerate: pnpm --filter @wcpos/printer generate:diagnostic-logo
//   (not a bare \`node\` run of the script — that skips the Chromium install it needs)
// Source mark: packages/printer/assets/wcpos-mark.svg
// See that script's header for why the mark is embedded and why it is encoded this way.

/**
 * Printed width of the diagnostic mark, in printer dots.
 *
 * Half the printable width of 58 mm paper and a third of 80 mm, so the mark is never
 * rescaled at print time — the bitmap below is rendered at exactly this width.
 */
export const DIAGNOSTIC_LOGO_WIDTH_DOTS = ${DOT_WIDTH};

/**
 * The WCPOS mark as a pre-thresholded 1-bit greyscale PNG data URI (${DOT_WIDTH}x${DOT_WIDTH}).
 *
 * Embedded rather than fetched so a blank logo box on the diagnostic means the printer
 * failed, never that the network or a CORS header did.
 */
export const DIAGNOSTIC_LOGO_DATA_URI =
\t'data:image/png;base64,${base64}';
`;

fs.writeFileSync(OUT_PATH, source);
console.log(
	`Wrote ${path.relative(process.cwd(), OUT_PATH)} — ${DOT_WIDTH}x${DOT_WIDTH}, ` +
		`${png.length} B png, ${base64.length} chars base64`
);
