import { printerLogger } from '../logger';
import { BLE_KEEP_ALIVE_MS } from './ble-profiles';
import { SPP_PREFIX } from './device-key';
import {
	DLE_EOT,
	isStatusReply,
	logStatusRead,
	STATUS_QUERIES,
	STATUS_REPLY_TIMEOUT_MS,
} from './escpos-status';
import { logPrintJob } from './log-print-job';

import type { PrinterStatus } from './escpos-status';
import type { PrinterTransport } from '../types';

/** The surface of apps/main/modules/bluetooth-spp (Android only). */
export interface BluetoothSppNativeModule {
	bondedDevices(): { address: string; name: string; printerClass: boolean }[];
	isConnected(address: string): boolean;
	connect(address: string): Promise<void>;
	write(address: string, base64: string): Promise<void>;
	read(address: string, timeoutMs: number): Promise<string | null>;
	disconnect(address: string): Promise<void>;
}

// RFCOMM has no MTU to respect, but a printer's serial buffer is small (a few KB on clones);
// 512-byte writes with a short pause let it drain without stalling the socket.
export const SPP_CHUNK_SIZE = 512;
const SPP_CHUNK_PAUSE_MS = 10;
// Same idle window as the LE lane: a till prints every minute or two, and a fresh RFCOMM
// connect costs one to three seconds the cashier would otherwise wait for each receipt.
export const SPP_KEEP_ALIVE_MS = BLE_KEEP_ALIVE_MS;
const MODULE_NAME = 'BluetoothSpp';
const MODULE_MISSING =
	'Bluetooth Classic printing needs the Android app rebuilt with the BluetoothSpp module.';

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function toBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function fromBase64(value: string): number[] {
	const decoded = atob(value);
	return Array.from(decoded, (char) => char.charCodeAt(0));
}

/**
 * Loads the app's local Expo module. Null on iOS (no SPP for third parties) and on an Android
 * build that predates the module, which is the one case the caller should say out loud.
 */
export async function loadSppModule(): Promise<{
	module: BluetoothSppNativeModule | null;
	android: boolean;
}> {
	const core = await import('expo-modules-core');
	const android = core.Platform.OS === 'android';
	const module = android
		? core.requireOptionalNativeModule<BluetoothSppNativeModule>(MODULE_NAME)
		: null;
	if (android && !module) printerLogger.warn('Bluetooth SPP module missing from this build');
	return { module, android };
}

export function macFromAddress(address: string): string {
	return address.startsWith(SPP_PREFIX) ? address.slice(SPP_PREFIX.length) : address;
}

const idleTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleIdleDisconnect(module: BluetoothSppNativeModule, mac: string): void {
	clearTimeout(idleTimers.get(mac));
	idleTimers.set(
		mac,
		setTimeout(() => {
			idleTimers.delete(mac);
			module.disconnect(mac).catch(() => {
				// Deferred cleanup has no caller, and a link the printer already dropped is fine.
			});
		}, SPP_KEEP_ALIVE_MS)
	);
}

async function readStatus(
	module: BluetoothSppNativeModule,
	mac: string
): Promise<PrinterStatus | null> {
	const bytes: number[] = [];
	for (const n of STATUS_QUERIES) {
		await module.write(mac, toBase64(DLE_EOT(n)));
		const reply = await module.read(mac, STATUS_REPLY_TIMEOUT_MS);
		const byte = reply ? fromBase64(reply)[0] : undefined;
		// A printer that stops answering, or answers something that is not a status byte, has
		// said all it is going to say; what came back before it still counts.
		if (byte == null || !isStatusReply(byte)) break;
		bytes.push(byte);
	}
	return logStatusRead('spp-native', bytes);
}

/**
 * Bluetooth Classic (SPP) receipt printers on Android, through the app's own RFCOMM module —
 * the lane for the cheap 58 mm printers that pair in Android settings and never advertise a
 * GATT print service. The socket stays open between jobs and is dropped after a quiet minute.
 * The module's error lines are already the ones the cashier sees; nothing is rewrapped here.
 */
export class SppNativeAdapter implements PrinterTransport {
	readonly name = 'spp-native';
	private readonly mac: string;

	constructor(private address: string) {
		this.mac = macFromAddress(address);
	}

	private async open(): Promise<BluetoothSppNativeModule> {
		const { module } = await loadSppModule();
		if (!module) throw new Error(MODULE_MISSING);
		clearTimeout(idleTimers.get(this.mac));
		if (!module.isConnected(this.mac)) {
			await module.connect(this.mac);
			printerLogger.info('Bluetooth SPP connected', { context: { target: this.address } });
		}
		return module;
	}

	async printRaw(data: Uint8Array): Promise<void> {
		await logPrintJob(
			'Native',
			{ transport: this.name, target: this.address, bytes: data.byteLength },
			async () => {
				const module = await this.open();
				let chunks = 0;
				try {
					for (let offset = 0; offset < data.byteLength; offset += SPP_CHUNK_SIZE) {
						await module.write(this.mac, toBase64(data.subarray(offset, offset + SPP_CHUNK_SIZE)));
						chunks += 1;
						if (offset + SPP_CHUNK_SIZE < data.byteLength) await pause(SPP_CHUNK_PAUSE_MS);
					}
				} catch (cause) {
					printerLogger.warn('Bluetooth SPP print failed', {
						context: { cause: cause instanceof Error ? cause.message : String(cause), chunks },
					});
					// open() cleared the idle timer, so a failed socket would otherwise
					// stay open for good and the next job would reuse it. Drop it now.
					await module.disconnect(this.mac).catch(() => undefined);
					throw cause;
				}
				printerLogger.info('Bluetooth SPP print job written', {
					context: { bytes: data.byteLength, chunks },
				});
				scheduleIdleDisconnect(module, this.mac);
			}
		);
	}

	async queryStatus(): Promise<PrinterStatus | null> {
		let module: BluetoothSppNativeModule | undefined;
		try {
			module = await this.open();
			return await readStatus(module, this.mac);
		} catch (cause) {
			printerLogger.debug('Status query could not reach the printer', {
				context: { cause: cause instanceof Error ? cause.message : String(cause) },
			});
			return null;
		} finally {
			if (module) scheduleIdleDisconnect(module, this.mac);
		}
	}

	async printHtml(_html: string): Promise<void> {
		throw new Error('SppNativeAdapter does not support HTML printing. Use printRaw instead.');
	}

	async disconnect(): Promise<void> {
		clearTimeout(idleTimers.get(this.mac));
		idleTimers.delete(this.mac);
		const { module } = await loadSppModule();
		await module?.disconnect(this.mac).catch(() => {
			// Already gone is the outcome we wanted.
		});
	}
}
