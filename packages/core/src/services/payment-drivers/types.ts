import type { PaymentMethodDescriptor, PaymentRow, PaymentTransport } from '@wcpos/order-math';

export type DriverCapabilities = {
	discovery: 'harness' | 'sdk_ui';
	cancel: 'app' | 'on_device';
	refund: boolean;
};
export type ReaderInfo = {
	id: string;
	label: string;
	model?: string;
	serial?: string;
	battery?: number | null;
	transport: PaymentTransport;
};
export type DriverStatus = {
	connection: 'disconnected' | 'discovering' | 'connecting' | 'updating' | 'connected';
	reader: ReaderInfo | null;
	progress?: number | null;
	pairingCode?: string | null;
	message?: string | null;
};
export type CollectInput = {
	dp: number;
	row: PaymentRow;
	method: PaymentMethodDescriptor;
	transport: PaymentTransport;
	handoff: Record<string, unknown> | null;
	offline: boolean;
	tipEligibleMinor: number | null;
};
export type CollectResult = {
	outcome: 'captured' | 'authorized' | 'declined' | 'cancelled';
	provider_refs: Record<string, unknown>;
	receipt: Record<string, unknown>;
	amount: string | null;
	transport: PaymentTransport;
	failure_reason?: string | null;
};
export type OfflineSettlement = { rowId: string; provider_refs: Record<string, unknown> };
export type DevControl = {
	id: string;
	label: string;
	active?: boolean;
	run(): Promise<void>;
};
export interface PaymentDriver {
	readonly provider: string;
	readonly capabilities: DriverCapabilities;
	availability():
		| { available: true }
		| {
				available: false;
				reason: 'web' | 'permission' | 'bluetooth_off' | 'not_logged_in' | 'unsupported';
		  };
	discoverReaders?(transport: PaymentTransport): Promise<ReaderInfo[]>;
	connect?(reader: ReaderInfo, handoff: Record<string, unknown> | null): Promise<void>;
	disconnect?(): Promise<void>;
	openReaderSettings?(): Promise<void>;
	/** Dev affordance: the harness only calls this when __DEV__ is true. */
	devControls?(): DevControl[];
	collect(input: CollectInput): Promise<CollectResult>;
	cancel?(): Promise<void>;
	status$: { subscribe(listener: (s: DriverStatus) => void): () => void; get(): DriverStatus };
	settleOffline$?: { subscribe(listener: (e: OfflineSettlement) => void): () => void };
}
