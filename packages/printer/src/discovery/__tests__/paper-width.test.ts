import { describe, expect, it, vi } from 'vitest';

import { columnsForPaperWidthMm, resolveNativePrinterColumns } from '../paper-width';

const { getPaperWidthMm } = vi.hoisted(() => ({ getPaperWidthMm: vi.fn() }));
vi.mock('../../transport/epson-native-adapter', () => ({
	EpsonNativeAdapter: class {
		getPaperWidthMm = getPaperWidthMm;
	},
}));
vi.mock('../../logger', () => ({ printerLogger: { info: vi.fn() } }));

describe('native printer paper width', () => {
	it.each([
		[58, 32],
		[60, 35],
		[70, 42],
		[76, 45],
		[80, 48],
	] as const)('maps %d mm to %d columns', async (width, columns) => {
		getPaperWidthMm.mockResolvedValueOnce(width);
		expect(columnsForPaperWidthMm(width)).toBe(columns);
		await expect(
			resolveNativePrinterColumns({
				address: 'BT:printer',
				connectionType: 'bluetooth',
				vendor: 'epson',
				name: 'Unknown',
			})
		).resolves.toEqual({ columns, source: 'printer' });
	});

	it('falls back to the model table when the SDK query fails', async () => {
		getPaperWidthMm.mockRejectedValueOnce(new Error('query failed'));
		await expect(
			resolveNativePrinterColumns({
				address: 'USB:printer',
				connectionType: 'usb',
				vendor: 'epson',
				name: 'TM-m30III_055889',
			})
		).resolves.toEqual({ columns: 48, source: 'model' });
	});
});
