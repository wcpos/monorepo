import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BURST_SETTLE_MS, createBurstAssembler } from './burst-assembler';

const NO_BOUNDARY = { prefix: '', suffix: '' };

function assembler(overrides: { prefix?: string; suffix?: string } = {}) {
	const scans: string[] = [];
	const instance = createBurstAssembler({
		onScan: (code) => scans.push(code),
		getSettings: () => ({ ...NO_BOUNDARY, ...overrides }),
	});
	return { scans, instance };
}

describe('createBurstAssembler', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('completes a burst on the terminator key immediately', () => {
		const { scans, instance } = assembler();
		for (const key of '9310988001234'.split('')) instance.push(key);
		instance.push('Enter');
		expect(scans).toEqual(['9310988001234']);
	});

	it('completes a burst after the settle timeout without a terminator', () => {
		const { scans, instance } = assembler();
		for (const key of '12345678'.split('')) instance.push(key);
		expect(scans).toEqual([]);
		vi.advanceTimersByTime(BURST_SETTLE_MS);
		expect(scans).toEqual(['12345678']);
	});

	it('does not complete on elapsed time when settling is disabled', () => {
		const scans: string[] = [];
		const instance = createBurstAssembler({
			onScan: (code) => scans.push(code),
			getSettings: () => NO_BOUNDARY,
			settleMs: null,
		});
		for (const key of '12345678'.split('')) instance.push(key);
		vi.advanceTimersByTime(BURST_SETTLE_MS * 2);
		expect(scans).toEqual([]);
		instance.push('Enter');
		expect(scans).toEqual(['12345678']);
	});

	it('ignores non-printable keys inside a burst', () => {
		const { scans, instance } = assembler();
		for (const key of ['1', 'Shift', '2', 'Shift', '3']) instance.push(key);
		instance.push('Enter');
		expect(scans).toEqual(['123']);
	});

	it('strips the configured prefix and suffix at completion', () => {
		const { scans, instance } = assembler({ prefix: '*', suffix: '#' });
		for (const key of ['*', ...'12345678'.split(''), '#']) instance.push(key);
		instance.push('Enter');
		expect(scans).toEqual(['12345678']);
	});

	it('emits separate bursts for interleaved devices via separate assemblers', () => {
		const a = assembler();
		const b = assembler();
		a.instance.push('1');
		b.instance.push('9');
		a.instance.push('2');
		b.instance.push('8');
		a.instance.push('Enter');
		b.instance.push('Enter');
		expect(a.scans).toEqual(['12']);
		expect(b.scans).toEqual(['98']);
	});

	it('does not emit an empty burst on a lone terminator', () => {
		const { scans, instance } = assembler();
		instance.push('Enter');
		vi.advanceTimersByTime(BURST_SETTLE_MS);
		expect(scans).toEqual([]);
	});

	it('dispose drops a partial burst', () => {
		const { scans, instance } = assembler();
		instance.push('1');
		instance.dispose();
		vi.advanceTimersByTime(BURST_SETTLE_MS);
		expect(scans).toEqual([]);
	});
});
