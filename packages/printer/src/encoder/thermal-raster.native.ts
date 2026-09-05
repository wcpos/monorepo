import * as jpeg from 'jpeg-js';
import * as UPNG from 'upng-js';

import type { ThermalRasterImage } from '@wcpos/receipt-renderer';

import { printerLogger } from '../logger';
import { normalizeThermalImageSize } from './thermal-raster-shared';

export async function rasterizeThermalImage(input: {
	loadSrc: string;
	requestedWidth: number;
	maxWidth: number;
}): Promise<ThermalRasterImage | undefined> {
	try {
		const bytes = await loadBytes(input.loadSrc);
		const decoded = decodeImage(bytes);
		if (!decoded) throw new Error('Unsupported thermal image format');
		const desiredWidth = Math.min(input.requestedWidth || decoded.width, input.maxWidth);
		const size = normalizeThermalImageSize({
			width: desiredWidth,
			height: decoded.height * (desiredWidth / decoded.width),
			maxWidth: input.maxWidth,
		});
		return {
			image: { ...size, data: scaleNearest(decoded, size) },
			...size,
			algorithm: 'atkinson',
			threshold: 128,
		};
	} catch (error) {
		printerLogger.debug('Thermal image asset skipped', {
			context: { cause: error instanceof Error ? error.message : String(error) },
		});
		return undefined;
	}
}

async function loadBytes(src: string): Promise<Uint8Array> {
	const data = /^data:image\/(?:png|jpe?g);base64,(.+)$/i.exec(src);
	if (data) {
		// Some data URLs arrive without base64 padding; atob (Node and Hermes) rejects those.
		const payload = (data[1] ?? '').replace(/\s+/g, '');
		const binary = atob(payload + '='.repeat((4 - (payload.length % 4)) % 4));
		return Uint8Array.from(binary, (char) => char.charCodeAt(0));
	}
	const response = await fetch(src);
	if (!response.ok) throw new Error('Failed to fetch thermal image asset');
	return new Uint8Array(await response.arrayBuffer());
}

function decodeImage(
	bytes: Uint8Array
): { width: number; height: number; data: Uint8Array } | undefined {
	if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
		const png = UPNG.decode(bytes.buffer as ArrayBuffer);
		return { width: png.width, height: png.height, data: new Uint8Array(UPNG.toRGBA8(png)[0]) };
	}
	if (bytes[0] === 0xff && bytes[1] === 0xd8) {
		const image = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
		return { width: image.width, height: image.height, data: image.data };
	}
}

function scaleNearest(
	input: { width: number; height: number; data: Uint8Array },
	output: { width: number; height: number }
): Uint8ClampedArray {
	const data = new Uint8ClampedArray(output.width * output.height * 4);
	for (let y = 0; y < output.height; y++) {
		for (let x = 0; x < output.width; x++) {
			const source =
				(Math.floor((y * input.height) / output.height) * input.width +
					Math.floor((x * input.width) / output.width)) *
				4;
			const target = (y * output.width + x) * 4;
			const alpha = (input.data[source + 3] ?? 0) / 255;
			for (let channel = 0; channel < 3; channel++) {
				data[target + channel] = Math.round(
					(input.data[source + channel] ?? 255) * alpha + 255 * (1 - alpha)
				);
			}
			data[target + 3] = 255;
		}
	}
	return data;
}
