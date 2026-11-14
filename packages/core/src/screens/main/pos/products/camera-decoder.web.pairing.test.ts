/**
 * The web decoder serves `zxing_reader.wasm` from core's own `zxing-wasm` dependency
 * (camera-decoder.web.ts), but the JS glue that instantiates it is the `zxing-wasm`
 * that `barcode-detector` pins for itself. Emscripten renames the wasm exports on
 * every build, so glue from one release binds the wrong exports of a binary from
 * another: `_malloc` returns 0 and every frame throws
 * "Failed to allocate 921600 bytes in WASM memory" (one byte per pixel of a
 * 1280×720 frame) — the scanner reports "Barcode decoding is failing" on every open.
 * Seen on `next` 2026-10-30: core at zxing-wasm 3.1.5, barcode-detector 3.2.2 at 3.1.3.
 * A bump of either package alone recreates it, so this pins the pairing itself.
 *
 * Both resolutions use Node's real `require` (not Jest's) so they walk the installed
 * tree the way Metro does from each importer.
 */
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';

interface InstalledPackage {
	dir: string;
	version: string;
}

/** The nearest enclosing package.json named `name` above a resolved entry file. */
function packageOf(entryFile: string, name: string): InstalledPackage {
	let dir = path.dirname(entryFile);
	for (;;) {
		const manifest = path.join(dir, 'package.json');
		if (fs.existsSync(manifest)) {
			const parsed = JSON.parse(fs.readFileSync(manifest, 'utf8')) as {
				name?: string;
				version?: string;
			};
			if (parsed.name === name && parsed.version) {
				return { dir, version: parsed.version };
			}
		}
		const parent = path.dirname(dir);
		if (parent === dir) {
			throw new Error(`no ${name} package above ${entryFile}`);
		}
		dir = parent;
	}
}

const coreRequire = createRequire(__filename);
const served = packageOf(coreRequire.resolve('zxing-wasm'), 'zxing-wasm');
const detector = packageOf(coreRequire.resolve('barcode-detector'), 'barcode-detector');
const glue = packageOf(
	createRequire(path.join(detector.dir, 'package.json')).resolve('zxing-wasm'),
	'zxing-wasm'
);

describe('zxing-wasm glue and binary come from one release', () => {
	it('serves the wasm from the zxing-wasm release whose glue barcode-detector loads', () => {
		expect({ served: served.version }).toEqual({ served: glue.version });
	});

	it("decodes a 1280×720 frame through barcode-detector's glue and the served wasm", async () => {
		const zxing = createRequire(path.join(glue.dir, 'package.json'))(
			path.join(glue.dir, 'dist/cjs/reader/index.js')
		) as typeof import('zxing-wasm/reader');
		const bytes = fs.readFileSync(path.join(served.dir, 'dist/reader/zxing_reader.wasm'));
		zxing.prepareZXingModule({
			overrides: {
				wasmBinary: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
			},
			fireImmediately: true,
		});
		const frame: ImageData = {
			width: 1280,
			height: 720,
			colorSpace: 'srgb',
			data: new Uint8ClampedArray(1280 * 720 * 4),
		};

		await expect(zxing.readBarcodes(frame, { formats: ['EAN-13'] })).resolves.toEqual([]);
	});
});
