import { describe, expect, it } from 'vitest';

import { describeStatus, DLE_EOT, isStatusReply, parsePrinterStatus } from '../escpos-status';

// Reply bytes always carry bit 4 and never bit 7; 0x16/0x12 are the "nothing wrong" answers to
// n=1 and n=2/n=4, and each condition adds its own bit on top.
const ONLINE = 0x16;
const OFFLINE = 0x1e; // n=1 + bit 3
const OK_CAUSE = 0x12;
const COVER_OPEN = 0x16; // n=2 + bit 2
const PAPER_END = 0x32; // n=2 + bit 5
const ERROR = 0x52; // n=2 + bit 6
const SENSOR_OK = 0x12;
const SENSOR_NEAR_END = 0x1e; // n=4 + bits 2-3
const SENSOR_PAPER_END = 0x72; // n=4 + bits 5-6

describe('DLE_EOT', () => {
	it('builds the three-byte real-time request', () => {
		expect(Array.from(DLE_EOT(1))).toEqual([0x10, 0x04, 1]);
		expect(Array.from(DLE_EOT(4))).toEqual([0x10, 0x04, 4]);
	});
});

describe('isStatusReply', () => {
	it('accepts bit 4 set with bit 7 clear and nothing else', () => {
		expect(isStatusReply(0x12)).toBe(true);
		expect(isStatusReply(0x72)).toBe(true);
		expect(isStatusReply(0x92)).toBe(false);
		expect(isStatusReply(0x02)).toBe(false);
	});
});

describe('parsePrinterStatus', () => {
	it('reads a printer with paper, cover shut and nothing to report', () => {
		const status = parsePrinterStatus([ONLINE, OK_CAUSE, SENSOR_OK]);
		expect(status).toEqual({
			online: true,
			coverOpen: false,
			paperOut: false,
			paperNearEnd: false,
			error: false,
			raw: [ONLINE, OK_CAUSE, SENSOR_OK],
		});
		expect(describeStatus(status)).toBe('ok');
	});

	it('reads paper out from the offline cause and the paper sensor', () => {
		expect(describeStatus(parsePrinterStatus([OFFLINE, PAPER_END, SENSOR_OK]))).toBe('paper-out');
		expect(describeStatus(parsePrinterStatus([OFFLINE, OK_CAUSE, SENSOR_PAPER_END]))).toBe(
			'paper-out'
		);
	});

	it('reads a cover left open', () => {
		const status = parsePrinterStatus([OFFLINE, COVER_OPEN, SENSOR_OK]);
		expect(status.coverOpen).toBe(true);
		expect(status.online).toBe(false);
		expect(describeStatus(status)).toBe('cover-open');
	});

	it('reads the near-end sensor without calling the printer out of paper', () => {
		const status = parsePrinterStatus([ONLINE, OK_CAUSE, SENSOR_NEAR_END]);
		expect(status.paperNearEnd).toBe(true);
		expect(status.paperOut).toBe(false);
		expect(describeStatus(status)).toBe('ok');
	});

	it('reads a mechanical error, and an offline printer that gives no cause', () => {
		expect(describeStatus(parsePrinterStatus([OFFLINE, ERROR, SENSOR_OK]))).toBe('error');
		expect(describeStatus(parsePrinterStatus([OFFLINE, OK_CAUSE, SENSOR_OK]))).toBe('offline');
	});

	it('names paper first when the printer reports both paper and cover', () => {
		expect(describeStatus(parsePrinterStatus([OFFLINE, PAPER_END | 0x04, SENSOR_PAPER_END]))).toBe(
			'paper-out'
		);
	});

	it('tolerates a printer that answered only the first query, or none', () => {
		const partial = parsePrinterStatus([ONLINE]);
		expect(partial.raw).toEqual([ONLINE]);
		expect(partial.coverOpen).toBe(false);
		expect(describeStatus(partial)).toBe('ok');
		expect(describeStatus(parsePrinterStatus([]))).toBe('unknown');
		expect(describeStatus(parsePrinterStatus(Uint8Array.of(OFFLINE)))).toBe('offline');
	});
});
