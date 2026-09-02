import * as React from 'react';

import { v4 as uuidv4 } from 'uuid';

import { PrinterService, probeVendorEndpoint, usePrinterDiscovery } from '@wcpos/printer';
import type { DiscoveryError, PrinterProfile } from '@wcpos/printer';
import { Platform } from '@wcpos/utils/platform';

import { BridgeError, type BridgeHandlers } from '../bridge/types';
import { buildPrinterProfileFields } from '../../settings/printer/profile-config';
import {
	DEFAULT_FORM_VALUES,
	electronPrinterSchema,
	nativePrinterSchema,
	webPrinterSchema,
} from '../../settings/printer/schema';
import { useAvailablePrinterProfiles } from '../../settings/printer/use-available-printer-profiles';
import { useStoreSession } from '../../../../contexts/app-state';

import type { PrinterFormValues } from '../../settings/printer/schema';

const TRANSPORTS = ['network', 'bluetooth', 'usb', 'system'] as const;

function discoveryStatus(
	error: DiscoveryError | null
): 'ok' | 'unavailable' | 'permission' | 'failed' {
	if (!error || error.code.endsWith('none-found')) return 'ok';
	if (error.code === 'ipc-unavailable') return 'unavailable';
	return error.detail?.toLowerCase().match(/permission|denied/) ? 'permission' : 'failed';
}

async function probeTcp(host: string, port: number, timeoutMs: number) {
	if (!Platform.isNative) return { reachable: null, latencyMs: null };
	const started = Date.now();
	const TcpSocket = (await import('react-native-tcp-socket')).default;
	return new Promise<{ reachable: boolean; latencyMs: number }>((resolve) => {
		let settled = false;
		let socket: ReturnType<typeof TcpSocket.createConnection> | undefined;
		const finish = (reachable: boolean) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			socket?.destroy();
			resolve({ reachable, latencyMs: Date.now() - started });
		};
		const timer = setTimeout(() => finish(false), timeoutMs);
		try {
			socket = TcpSocket.createConnection({ host, port }, () => finish(true));
			socket.on('error', () => finish(false));
		} catch {
			finish(false);
		}
	});
}

function candidateProfile(candidate: Record<string, unknown>): PrinterProfile {
	const data = {
		...DEFAULT_FORM_VALUES,
		...candidate,
		name: typeof candidate.name === 'string' ? candidate.name : 'Test',
		isDefault: false,
	} as PrinterFormValues;
	return {
		id: `test-${Date.now()}`,
		...buildPrinterProfileFields(data),
		isBuiltIn: false,
	};
}

export function usePrinterCapabilities(): BridgeHandlers {
	const profiles = useAvailablePrinterProfiles();
	const discovery = usePrinterDiscovery();
	const discoveryRef = React.useRef(discovery);
	const { storeDB } = useStoreSession();
	const printerService = React.useMemo(() => new PrinterService(), []);

	// The async scan handler must read the discovery hook's post-scan render, not its starting closure.
	React.useEffect(() => {
		discoveryRef.current = discovery;
	}, [discovery]);
	// PrinterService owns transport resources that must be released when this host unmounts.
	React.useEffect(() => () => void printerService.dispose(), [printerService]);

	return React.useMemo(
		() => ({
			'printers.list': async () => ({ profiles }),
			'printers.scan': async () => {
				const started = Date.now();
				await discoveryRef.current.startScan();
				await new Promise((resolve) => setTimeout(resolve, 0));
				const current = discoveryRef.current;
				const status = discoveryStatus(current.error);
				const supported = {
					network: true,
					bluetooth: Platform.isNative || !!current.connectBluetoothDevice,
					usb: Platform.isNative || !!current.connectUsbDevice,
					system: Platform.isElectron,
				};
				return {
					found: current.printers,
					transports: Object.fromEntries(
						TRANSPORTS.map((transport) => [
							transport,
							supported[transport] ? status : 'unavailable',
						])
					),
					durationMs: Date.now() - started,
				};
			},
			'printers.probe': async ({ host, ports = [9100], timeoutMs = 5000, vendorDetect = true }) => {
				if (
					typeof host !== 'string' ||
					!Array.isArray(ports) ||
					ports.length < 1 ||
					ports.length > 8 ||
					!ports.every((port) => Number.isInteger(port) && port >= 1 && port <= 65535)
				) {
					throw new BridgeError('bad_request', 'Host and 1–8 valid TCP ports are required');
				}
				const tcpTimeoutMs = typeof timeoutMs === 'number' ? timeoutMs : 5000;
				// Vendor detection is a chain of HTTP attempts (up to ~12 s); it must run alongside
				// the TCP probes or the bridge's 15 s ceiling for this action is exceeded.
				const [endpoint, tcp] = await Promise.all([
					vendorDetect === false ? Promise.resolve(null) : probeVendorEndpoint(host),
					Promise.all(ports.map((port) => probeTcp(host, port, tcpTimeoutMs))),
				]);
				const results = ports.map((port, index) => ({
					port,
					...tcp[index],
					vendor: endpoint?.vendor ?? null,
					raw: null,
				}));
				return { host, resolvedIp: host, results, sameSubnet: null };
			},
			'printers.testPrint': async (payload) => {
				const started = Date.now();
				const profile =
					typeof payload.profileId === 'string'
						? profiles.find(({ id }) => id === payload.profileId)
						: payload.candidate && typeof payload.candidate === 'object'
							? candidateProfile(payload.candidate as Record<string, unknown>)
							: undefined;
				if (!profile) throw new BridgeError('bad_request', 'Printer profile or candidate required');
				if (profile.connectionType === 'cloud') {
					throw new BridgeError('unavailable', 'Cloud test printing is unavailable');
				}
				try {
					await printerService.testPrint(profile);
				} catch (error) {
					throw new BridgeError('failed', error instanceof Error ? error.message : String(error));
				}
				return { ok: true, durationMs: Date.now() - started, warnings: [] };
			},
			'printers.saveProfile': async ({ profile, setDefault }) => {
				if (!profile || typeof profile !== 'object') {
					throw new BridgeError('bad_request', 'Printer profile required');
				}
				const profileData = profile as Record<string, unknown>;
				const id = typeof profileData.id === 'string' ? profileData.id : uuidv4();
				const schema = Platform.isElectron
					? electronPrinterSchema
					: Platform.isWeb
						? webPrinterSchema
						: nativePrinterSchema;
				const result = schema.safeParse({
					...profileData,
					...(typeof setDefault === 'boolean' ? { isDefault: setDefault } : {}),
				});
				if (!result.success) {
					throw new BridgeError('bad_request', 'Printer profile is invalid', {
						issues: result.error.issues,
					});
				}
				const collection = storeDB.collections.printer_profiles;
				const existing = profileData.id ? await collection.findOne(id).exec() : null;
				if (profileData.id && !existing) {
					throw new BridgeError('bad_request', 'Printer profile was not found');
				}
				const fields = buildPrinterProfileFields(result.data);
				if (existing) {
					await existing.patch(fields);
				} else {
					await collection.insert({ id, ...fields });
				}
				// Demote other defaults only once the target is persisted, so a failed save never
				// leaves the store without a default printer.
				if (result.data.isDefault) {
					const defaults = await collection.find({ selector: { isDefault: true } }).exec();
					for (const doc of defaults) if (doc.id !== id) await doc.patch({ isDefault: false });
				}
				return { profileId: id };
			},
		}),
		[printerService, profiles, storeDB]
	);
}
