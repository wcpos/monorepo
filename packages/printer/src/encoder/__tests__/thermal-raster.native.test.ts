import { afterEach, describe, expect, it, vi } from 'vitest';

import { rasterizeThermalImage } from '../thermal-raster.native';

const { debug } = vi.hoisted(() => ({ debug: vi.fn() }));
vi.mock('../../logger', () => ({ printerLogger: { debug } }));

const TWO_BY_TWO_PNG =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGNgYGD4DwJgEsQBAFa7CfdqxQ/7AAAAAElFTkSuQmCC';
const TWO_BY_TWO_JPEG =
	'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD4+/aF/aF+KfgL4+/Evwx4Y+JfjDw54b0XxNqem6Xo2k69dWtnYWsN1JHDbwQxyBIokRVRUUBVVQAABRRRQB//2Q=';

afterEach(() => {
	vi.restoreAllMocks();
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

describe('rasterizeThermalImage on native', () => {
	it('decodes and scales a PNG into the expected black and white raster', async () => {
		const raster = await rasterizeThermalImage({
			loadSrc: TWO_BY_TWO_PNG,
			requestedWidth: 8,
			maxWidth: 384,
		});

		expect(raster).toMatchObject({ width: 8, height: 8, algorithm: 'atkinson', threshold: 128 });
		expect(pixelAt(raster!.image.data, 8, 0, 0)).toEqual([0, 0, 0, 255]);
		expect(pixelAt(raster!.image.data, 8, 7, 0)).toEqual([255, 255, 255, 255]);
		expect(pixelAt(raster!.image.data, 8, 0, 7)).toEqual([255, 255, 255, 255]);
		expect(pixelAt(raster!.image.data, 8, 7, 7)).toEqual([0, 0, 0, 255]);
	});

	it('decodes a JPEG into a raster of the requested size', async () => {
		const raster = await rasterizeThermalImage({
			loadSrc: TWO_BY_TWO_JPEG,
			requestedWidth: 16,
			maxWidth: 384,
		});

		expect(raster).toMatchObject({ width: 16, height: 16 });
		expect(raster?.image.data).toHaveLength(16 * 16 * 4);
	});

	it('returns undefined and logs when a remote image cannot be fetched', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Promise.reject(new Error('unreachable')))
		);

		await expect(
			rasterizeThermalImage({
				loadSrc: 'https://example.test/logo.png',
				requestedWidth: 64,
				maxWidth: 384,
			})
		).resolves.toBeUndefined();
		expect(debug).toHaveBeenCalledWith('Thermal image asset skipped', {
			context: { cause: 'unreachable' },
		});
	});
});

function pixelAt(data: Uint8ClampedArray, width: number, x: number, y: number): number[] {
	const offset = (y * width + x) * 4;
	return Array.from(data.slice(offset, offset + 4));
}
