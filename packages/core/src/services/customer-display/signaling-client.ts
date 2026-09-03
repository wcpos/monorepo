export type HttpRequest = {
	method: 'GET' | 'POST' | 'DELETE';
	url: string;
	data?: unknown;
	params?: Record<string, unknown>;
};
export type HttpFunction = <T = unknown>(request: HttpRequest) => Promise<{ data: T }>;
export interface DisplayRegistryRow {
	id: string;
	name: string;
	device_id: string;
	store_id: number;
	paired_at: string;
	last_seen: string;
	connected: boolean;
}
export interface PairingCode {
	code: string;
	expires_at: string;
}
export type SignalType = 'offer' | 'answer' | 'candidate' | 'bye';
export interface OutgoingSignal {
	from: string;
	to: 'display';
	type: SignalType;
	session: string;
	body: unknown;
}
export interface IncomingSignal extends Omit<OutgoingSignal, 'from' | 'to'> {
	id: number;
	from: 'display';
	to: string;
	created_at: string;
}
export function createSignalingClient(restRoot: string, http: HttpFunction) {
	const root = restRoot.replace(/\/$/, '');
	return {
		async mintPairingCode(deviceId: string, storeId: number): Promise<PairingCode> {
			return (
				await http<PairingCode>({
					method: 'POST',
					url: `${root}/pairings`,
					data: { device_id: deviceId, store_id: storeId },
				})
			).data;
		},
		async listDisplays(deviceId: string): Promise<DisplayRegistryRow[]> {
			return (
				await http<DisplayRegistryRow[]>({
					method: 'GET',
					url: `${root}/displays`,
					params: { device_id: deviceId },
				})
			).data;
		},
		async readSignals(displayId: string, since: number): Promise<IncomingSignal[]> {
			return (
				await http<{ messages: IncomingSignal[] }>({
					method: 'GET',
					url: `${root}/displays/${displayId}/signal`,
					params: { for: 'pos', since },
				})
			).data.messages;
		},
		async postSignal(displayId: string, signal: OutgoingSignal): Promise<void> {
			await http({ method: 'POST', url: `${root}/displays/${displayId}/signal`, data: signal });
		},
		async forget(displayId: string): Promise<void> {
			await http({ method: 'DELETE', url: `${root}/displays/${displayId}` });
		},
	};
}
export type SignalingClient = ReturnType<typeof createSignalingClient>;
