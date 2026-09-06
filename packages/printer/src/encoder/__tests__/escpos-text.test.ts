import { describe, expect, it, vi } from 'vitest';

import { withEscposFontA } from '../escpos-text';

vi.mock('../../logger', () => ({
	printerLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('withEscposFontA', () => {
	it('leaves a job that already selects Font A untouched', () => {
		const initialized = Uint8Array.from([0x1b, 0x40, 0x1c, 0x2e, 0x1b, 0x4d, 0x00, 0x41]);

		expect(withEscposFontA(initialized, 'esc-pos')).toEqual(initialized);
	});

	it('inserts the font select after the reset when the job carries none', () => {
		const bytes = Uint8Array.from([0x1b, 0x40, 0x41, 0x42]);

		expect(Array.from(withEscposFontA(bytes, 'esc-pos'))).toEqual([
			0x1b, 0x40, 0x1b, 0x4d, 0x00, 0x41, 0x42,
		]);
	});

	it('inserts at the head of a job that does not open with a reset', () => {
		const bytes = Uint8Array.from([0x41, 0x42]);

		expect(Array.from(withEscposFontA(bytes, 'esc-pos'))).toEqual([0x1b, 0x4d, 0x00, 0x41, 0x42]);
	});

	it.each(['star-prnt', 'star-line'] as const)('never sends ESC M to a %s printer', (language) => {
		const bytes = Uint8Array.from([0x1b, 0x40, 0x18, 0x41]);

		expect(withEscposFontA(bytes, language)).toEqual(bytes);
	});
});
