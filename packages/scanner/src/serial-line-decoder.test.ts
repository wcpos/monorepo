import { describe, expect, it } from 'vitest';

import { createSerialLineDecoder } from './serial-line-decoder';

function decoder(overrides: { prefix?: string; suffix?: string } = {}) {
	const scans: string[] = [];
	const instance = createSerialLineDecoder({
		onScan: (code) => scans.push(code),
		getSettings: () => ({ prefix: '', suffix: '', ...overrides }),
	});
	return { scans, instance };
}

describe('createSerialLineDecoder', () => {
	it('emits a line terminated by LF', () => {
		const { scans, instance } = decoder();
		instance.push('9310988001234\n');
		expect(scans).toEqual(['9310988001234']);
	});

	it('emits a line terminated by CRLF without an empty second line', () => {
		const { scans, instance } = decoder();
		instance.push('9310988001234\r\n');
		expect(scans).toEqual(['9310988001234']);
	});

	it('reassembles a code split across chunks', () => {
		const { scans, instance } = decoder();
		instance.push('93109');
		instance.push('88001234');
		expect(scans).toEqual([]);
		instance.push('\r');
		expect(scans).toEqual(['9310988001234']);
	});

	it('emits multiple lines contained in one chunk', () => {
		const { scans, instance } = decoder();
		instance.push('AAA\r\nBBB\r\nCCC\n');
		expect(scans).toEqual(['AAA', 'BBB', 'CCC']);
	});

	it('ignores empty lines / stray terminators', () => {
		const { scans, instance } = decoder();
		instance.push('\r\n\n');
		instance.push('X\n');
		expect(scans).toEqual(['X']);
	});

	it('strips a configured prefix and suffix per line', () => {
		const { scans, instance } = decoder({ prefix: '*', suffix: '#' });
		instance.push('*12345678#\r\n');
		expect(scans).toEqual(['12345678']);
	});

	it('reset drops a buffered partial line', () => {
		const { scans, instance } = decoder();
		instance.push('partial');
		instance.reset();
		instance.push('\n');
		expect(scans).toEqual([]);
	});
});
