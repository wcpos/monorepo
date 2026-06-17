import { describe, expect, it } from 'vitest';

import {
	buildCloudTarget,
	buildSerialKey,
	buildUsbKey,
	buildWinspoolKey,
	connectionTypeForTarget,
	parseTarget,
	SYSTEM_TARGET,
} from '../device-key';

describe('device-key target codec', () => {
	it('builds and parses serial device keys without rewriting the path', () => {
		const raw = buildSerialKey('/dev/cu.TM-P20-SerialPort');

		expect(raw).toBe('serial:/dev/cu.TM-P20-SerialPort');
		expect(parseTarget(raw)).toEqual({
			kind: 'serial',
			path: '/dev/cu.TM-P20-SerialPort',
			raw,
		});
		expect(connectionTypeForTarget(raw)).toBe('bluetooth');
	});

	it('rejects empty serial device keys as unknown', () => {
		expect(parseTarget('serial:')).toEqual({ kind: 'unknown', raw: 'serial:' });
		expect(connectionTypeForTarget('serial:')).toBeUndefined();
	});

	it('builds and parses USB device keys using the existing decimal field grammar', () => {
		const raw = buildUsbKey({ vid: 1208, pid: 514, bus: 1, address: 4 });

		expect(raw).toBe('usb:1208:514:1:4');
		expect(parseTarget(raw)).toEqual({
			kind: 'usb',
			vid: 1208,
			pid: 514,
			bus: 1,
			address: 4,
			raw,
		});
		expect(connectionTypeForTarget(raw)).toBe('usb');
	});

	it('returns unknown for malformed USB keys instead of throwing', () => {
		for (const raw of ['usb:', 'usb:1208:514:1', 'usb:1208:514:1:4:9', 'usb:12x:514:1:4']) {
			expect(parseTarget(raw)).toEqual({ kind: 'unknown', raw });
			expect(connectionTypeForTarget(raw)).toBeUndefined();
		}
	});

	it('builds and parses winspool device keys without rewriting queue names', () => {
		const raw = buildWinspoolKey('EPSON TM-T20III Réception');

		expect(raw).toBe('winspool:EPSON TM-T20III Réception');
		expect(parseTarget(raw)).toEqual({
			kind: 'winspool',
			queue: 'EPSON TM-T20III Réception',
			raw,
		});
		expect(connectionTypeForTarget(raw)).toBe('system');
	});

	it('rejects empty winspool device keys as unknown', () => {
		expect(parseTarget('winspool:')).toEqual({ kind: 'unknown', raw: 'winspool:' });
		expect(connectionTypeForTarget('winspool:')).toBeUndefined();
	});

	it('recognises system, cloud, and bare local profile targets', () => {
		expect(parseTarget(SYSTEM_TARGET)).toEqual({ kind: 'system', raw: 'system' });
		expect(connectionTypeForTarget(SYSTEM_TARGET)).toBe('system');

		const cloud = buildCloudTarget('cloud-printer-7');
		expect(cloud).toBe('cloud:cloud-printer-7');
		expect(parseTarget(cloud)).toEqual({
			kind: 'cloud',
			cloudPrinterId: 'cloud-printer-7',
			raw: cloud,
		});
		expect(connectionTypeForTarget(cloud)).toBe('cloud');

		expect(parseTarget('550e8400-e29b-41d4-a716-446655440000')).toEqual({
			kind: 'uuid',
			uuid: '550e8400-e29b-41d4-a716-446655440000',
			raw: '550e8400-e29b-41d4-a716-446655440000',
		});
		expect(connectionTypeForTarget('550e8400-e29b-41d4-a716-446655440000')).toBeUndefined();
	});
});
