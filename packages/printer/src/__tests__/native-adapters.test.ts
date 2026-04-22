import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EpsonNativeAdapter } from '../transport/epson-native-adapter';
import { StarNativeAdapter } from '../transport/star-native-adapter';

const {
	PrinterMock,
	epsonConnectMock,
	epsonAddCommandMock,
	epsonSendDataMock,
	epsonDisconnectMock,
	StarConnectionSettingsMock,
	StarPrinterMock,
	starOpenMock,
	starPrintRawDataMock,
	starCloseMock,
	starDisposeMock,
} = vi.hoisted(() => ({
	PrinterMock: vi.fn(),
	epsonConnectMock: vi.fn().mockResolvedValue(undefined),
	epsonAddCommandMock: vi.fn().mockResolvedValue(undefined),
	epsonSendDataMock: vi.fn().mockResolvedValue(undefined),
	epsonDisconnectMock: vi.fn().mockResolvedValue(undefined),
	StarConnectionSettingsMock: vi.fn(),
	StarPrinterMock: vi.fn(),
	starOpenMock: vi.fn().mockResolvedValue(undefined),
	starPrintRawDataMock: vi.fn().mockResolvedValue(undefined),
	starCloseMock: vi.fn().mockResolvedValue(undefined),
	starDisposeMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('react-native-esc-pos-printer', () => ({
	Printer: PrinterMock,
}));

vi.mock('react-native-star-io10', () => ({
	InterfaceType: {
		Lan: 'Lan',
		Bluetooth: 'Bluetooth',
		Usb: 'Usb',
	},
	StarConnectionSettings: StarConnectionSettingsMock,
	StarPrinter: StarPrinterMock,
}));

describe('native printer adapters', () => {
	beforeEach(() => {
		PrinterMock.mockReset();
		epsonConnectMock.mockClear();
		epsonAddCommandMock.mockClear();
		epsonSendDataMock.mockClear();
		epsonDisconnectMock.mockClear();

		StarConnectionSettingsMock.mockReset();
		StarPrinterMock.mockReset();
		starOpenMock.mockClear();
		starPrintRawDataMock.mockClear();
		starCloseMock.mockClear();
		starDisposeMock.mockClear();

		PrinterMock.mockImplementation(function Printer(this: any, { target }: { target: string }) {
			this.target = target;
			this.connect = epsonConnectMock;
			this.addCommand = epsonAddCommandMock;
			this.sendData = epsonSendDataMock;
			this.disconnect = epsonDisconnectMock;
		});

		StarConnectionSettingsMock.mockImplementation(function StarConnectionSettings(this: any) {
			this.identifier = '';
			this.interfaceType = 'Unknown';
			this.autoSwitchInterface = false;
		});

		StarPrinterMock.mockImplementation(function StarPrinter(this: any, settings: any) {
			this.connectionSettings = settings;
			this.open = starOpenMock;
			this.printRawData = starPrintRawDataMock;
			this.close = starCloseMock;
			this.dispose = starDisposeMock;
		});
	});

	it('EpsonNativeAdapter sends raw bytes via the Epson SDK target', async () => {
		const adapter = new EpsonNativeAdapter('192.168.1.20', 'network');

		await adapter.printRaw(new Uint8Array([0x1b, 0x40, 0x0a]));

		expect(PrinterMock).toHaveBeenCalledWith({
			target: 'TCP:192.168.1.20',
			deviceName: 'WCPOS Epson Printer',
		});
		expect(epsonConnectMock).toHaveBeenCalled();
		expect(epsonAddCommandMock).toHaveBeenCalledWith(new Uint8Array([0x1b, 0x40, 0x0a]));
		expect(epsonSendDataMock).toHaveBeenCalled();
		expect(epsonDisconnectMock).toHaveBeenCalled();
	});

	it('StarNativeAdapter opens the Star printer and sends raw byte arrays', async () => {
		const adapter = new StarNativeAdapter('star-printer.local', 'network');

		await adapter.printRaw(new Uint8Array([0x1b, 0x40]));

		expect(StarConnectionSettingsMock).toHaveBeenCalled();
		expect(StarPrinterMock).toHaveBeenCalled();
		expect(starOpenMock).toHaveBeenCalled();
		expect(starPrintRawDataMock).toHaveBeenCalledWith([0x1b, 0x40]);
		expect(starCloseMock).toHaveBeenCalled();
		expect(starDisposeMock).toHaveBeenCalled();
	});
});
