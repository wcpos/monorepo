import type { DiscoveredPrinter, PrinterProfile } from '@wcpos/printer';

export type BridgeErrorCode =
	| 'unsupported_version'
	| 'bad_envelope'
	| 'capability_denied'
	| 'bad_request'
	| 'timeout'
	| 'unavailable'
	| 'permission'
	| 'failed'
	| 'internal';

export interface BridgeEnvelope<T extends object = object> {
	wcpos: 1;
	id: string;
	action: string;
	payload: T;
}

export class BridgeError extends Error {
	constructor(
		public readonly code: BridgeErrorCode,
		message: string,
		public readonly detail: object = {}
	) {
		super(message);
		this.name = 'BridgeError';
	}
}

type AppPlatform = 'ios' | 'android' | 'web' | 'electron';
type Transport = 'network' | 'bluetooth' | 'usb' | 'system';
type TransportStatus = 'ok' | 'unavailable' | 'permission' | 'failed';
type PlatformInfo = {
	os: AppPlatform;
	osVersion: string;
	appVersion: string;
	webview: 'wkwebview' | 'chromium';
};
type StoreInfo = {
	id: string | number;
	name: string;
	currency: string;
	locale: string;
	timezone: string;
};
export type AppInitPayload = {
	locale: string;
	theme: { scheme: string; accent: string };
	platform: PlatformInfo;
	store: StoreInfo;
	capabilities: string[];
};

export type PrintersListRequest = Record<string, never>;
export type PrintersListResponse = { profiles: PrinterProfile[] };
export type PrintersScanRequest = { transports?: Transport[]; timeoutMs?: number };
export type PrintersScanResponse = {
	found: DiscoveredPrinter[];
	transports: Record<Transport, TransportStatus>;
	durationMs: number;
};
export type PrintersProbeRequest = {
	host: string;
	ports?: number[];
	timeoutMs?: number;
	vendorDetect?: boolean;
};
type ProbeResult = {
	port: number;
	reachable: boolean | null;
	latencyMs: number | null;
	vendor: PrinterProfile['vendor'] | null;
	raw: string | null;
};
export type PrintersProbeResponse = {
	host: string;
	resolvedIp: string;
	results: ProbeResult[];
	sameSubnet: boolean | null;
};
export type PrintersTestPrintRequest =
	{ profileId: string } | { candidate: Partial<Omit<PrinterProfile, 'id' | 'isBuiltIn'>> };
export type PrintersTestPrintResponse = { ok: true; durationMs: number; warnings: string[] };
export type PrintersSaveProfileRequest = { profile: Partial<PrinterProfile>; setDefault?: boolean };
export type PrintersSaveProfileResponse = { profileId: string };
export type HttpProxyRequest = {
	method: string;
	path: string;
	query?: Record<string, string | number | boolean>;
	body?: unknown;
	headers?: Record<string, string>;
};
export type HttpProxyResponse = {
	status: number;
	headers: { 'content-type': string };
	body: unknown;
	truncated?: true;
};
export type UiToastRequest = {
	message: string;
	kind: 'info' | 'success' | 'error';
	durationMs?: number;
};
export type UiCloseRequest = { result: 'saved' | 'cancelled' | 'unchanged' };
export type UiOpenExternalRequest = { url: string };

export type BridgeHandler = (payload: Record<string, unknown>) => Promise<object>;
export type BridgeHandlers = Record<string, BridgeHandler>;
