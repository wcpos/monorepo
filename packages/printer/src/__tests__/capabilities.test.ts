import { describe, expect, it } from 'vitest';

import { canOpenDrawer } from '../capabilities';

import type { PrinterProfile } from '../types';

const base: PrinterProfile = {
	id: 'p1',
	name: 'Printer',
	connectionType: 'cloud',
	vendor: 'generic',
	port: 9100,
	language: 'esc-pos',
	columns: 42,
	fullReceiptRaster: false,
	autoCut: true,
	autoOpenDrawer: false,
	isDefault: false,
	isBuiltIn: false,
	cloudPrinterId: 'reg-1',
};

describe('canOpenDrawer', () => {
	it('allows Star CloudPRNT, whose receipts are server-rendered but which still takes a raw kick', () => {
		// Regression: gating this on isOrderBasedCloudProfile() hid the drawer
		// button for every Star printer the moment Star became order-based.
		expect(canOpenDrawer({ ...base, cloudProvider: 'star-cloudprnt' })).toBe(true);
	});

	it('refuses providers that cannot take a raw payload at all', () => {
		expect(canOpenDrawer({ ...base, cloudProvider: 'epson-sdp' })).toBe(false);
		expect(canOpenDrawer({ ...base, cloudProvider: 'printnode' })).toBe(false);
	});

	it('allows every transport we can push bytes over', () => {
		expect(canOpenDrawer({ ...base, connectionType: 'network', address: '1.2.3.4' })).toBe(true);
		expect(canOpenDrawer({ ...base, connectionType: 'usb' })).toBe(true);
		expect(canOpenDrawer({ ...base, connectionType: 'bluetooth' })).toBe(true);
		// Legacy cloud profile with no provider.
		expect(canOpenDrawer(base)).toBe(true);
	});

	it('refuses the system print dialog, which cannot fire a drawer', () => {
		expect(canOpenDrawer({ ...base, connectionType: 'system' })).toBe(false);
	});

	it('refuses a missing profile', () => {
		expect(canOpenDrawer(undefined)).toBe(false);
	});
});
