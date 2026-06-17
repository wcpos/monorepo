import { describe, expect, it } from 'vitest';

import { createDeviceTransport } from '../device-adapter.electron';
import { SerialElectronAdapter } from '../serial-adapter.electron';
import { UsbElectronAdapter } from '../usb-adapter.electron';

import type { PrinterProfile } from '../../types';

const baseProfile = {
	id: 'p1',
	name: 'Test printer',
	vendor: 'generic',
} as unknown as PrinterProfile;

describe('createDeviceTransport (electron)', () => {
	it('routes winspool: addresses to the native spooler adapter even for bluetooth profiles', async () => {
		const transport = await createDeviceTransport({
			...baseProfile,
			connectionType: 'bluetooth',
			address: 'winspool:EPSON TM-T20III Receipt',
		} as PrinterProfile);
		expect(transport).toBeInstanceOf(UsbElectronAdapter);
	});

	it('routes usb profiles to the native adapter', async () => {
		const transport = await createDeviceTransport({
			...baseProfile,
			connectionType: 'usb',
			address: 'usb:1208:514:1:4',
		} as PrinterProfile);
		expect(transport).toBeInstanceOf(UsbElectronAdapter);
	});

	it('rejects profiles without an address', async () => {
		await expect(
			createDeviceTransport({
				...baseProfile,
				connectionType: 'usb',
				address: '',
			} as PrinterProfile)
		).rejects.toThrow('missing its device key');
	});

	it('routes serial: bluetooth profiles to the serial adapter (OS-paired Bluetooth Classic)', async () => {
		const transport = await createDeviceTransport({
			...baseProfile,
			connectionType: 'bluetooth',
			address: 'serial:/dev/cu.TM-P20',
		} as PrinterProfile);
		expect(transport).toBeInstanceOf(SerialElectronAdapter);
	});
});
