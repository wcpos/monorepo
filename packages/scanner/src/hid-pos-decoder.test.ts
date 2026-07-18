import { describe, expect, it } from 'vitest';

import { decodeHidPosReport } from './hid-pos-decoder';

function report(code: string, symbologyId?: number): number[] {
	const data = [...code].map((char) => char.charCodeAt(0));
	const bytes = [data.length, ...data];
	if (symbologyId !== undefined) {
		bytes.push(symbologyId);
	}
	return bytes;
}

describe('decodeHidPosReport', () => {
	it('decodes a length-prefixed decoded-data report', () => {
		expect(decodeHidPosReport(report('9310988001234'))).toEqual({ code: '9310988001234' });
	});

	it('maps the trailing symbology identifier to a symbology string', () => {
		expect(decodeHidPosReport(report('4006381333931', 0x0a))).toEqual({
			code: '4006381333931',
			symbology: 'ean13',
		});
	});

	it('strips a leading report id when hasReportId is set', () => {
		const bytes = [0x02, ...report('12345678')];
		expect(decodeHidPosReport(bytes, { hasReportId: true })).toEqual({ code: '12345678' });
	});

	it('returns null for an empty / keep-alive report', () => {
		expect(decodeHidPosReport([0, 0, 0, 0])).toBeNull();
		expect(decodeHidPosReport([])).toBeNull();
	});

	it('returns null when the declared length exceeds the payload', () => {
		expect(decodeHidPosReport([50, 0x41, 0x42])).toBeNull();
	});

	it('returns null when the data contains non-printable bytes', () => {
		expect(decodeHidPosReport([3, 0x41, 0x00, 0x42])).toBeNull();
	});

	it('accepts an Uint8Array report', () => {
		expect(decodeHidPosReport(Uint8Array.from(report('ABC1234')))).toEqual({ code: 'ABC1234' });
	});

	it('leaves symbology undefined for an unknown identifier', () => {
		expect(decodeHidPosReport(report('12345678', 0xff))).toEqual({ code: '12345678' });
	});
});
