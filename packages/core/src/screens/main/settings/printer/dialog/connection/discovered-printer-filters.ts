import { parseTarget } from '@wcpos/printer/transport/device-key';
import type { DiscoveredPrinter } from '@wcpos/printer';

export type OsPrinterTargetKind = 'serial' | 'winspool';

export function hasTargetKind(printer: DiscoveredPrinter, kind: OsPrinterTargetKind): boolean {
	return parseTarget(printer.address).kind === kind;
}

export function isSerialBackedBluetooth(printer: DiscoveredPrinter): boolean {
	return hasTargetKind(printer, 'serial');
}

export function isBluetoothPickerPrinter(printer: DiscoveredPrinter): boolean {
	// Product nuance: OS-paired Bluetooth Classic printers are addressed by serial:
	// device keys. Keep them surfaced in the Bluetooth picker even if the display
	// connectionType changes later; routing is owned by the parseable device key.
	return printer.connectionType === 'bluetooth' || isSerialBackedBluetooth(printer);
}

export function isUsbLikeDevice(printer: DiscoveredPrinter): boolean {
	const kind = parseTarget(printer.address).kind;
	// Windows usb-discovery returns installed spooler queues. They honestly report
	// connectionType "system", but remain USB-tab candidates because this is the
	// only printable Windows path for USB-class receipt printers.
	return printer.connectionType === 'usb' || kind === 'winspool';
}
