import type { OrderPaymentSummary, PaymentRow } from '@wcpos/order-math';

import { createServerLeg } from '../../screens/main/pos/checkout/payments/server/server-leg';

import type {
	ServerLeg,
	ServerLegDeps,
	ServerLegResponse,
	ServerLegState,
} from '../../screens/main/pos/checkout/payments/server/server-leg';

export interface TerminalPaymentsServiceOptions {
	http: Pick<ServerLegDeps, 'get' | 'post'>;
	mirror: (orderUuid: string, response: ServerLegResponse) => Promise<void>;
	onCaptured?: (orderUuid: string, order: OrderPaymentSummary | undefined) => void;
	now?: ServerLegDeps['now'];
	setTimeout?: ServerLegDeps['setTimeout'];
	clearTimeout?: ServerLegDeps['clearTimeout'];
}
interface ResumeInput {
	orderUuid: string;
	orderId: number;
	orderNumber: string;
	row: PaymentRow;
}
interface BeginInput extends ResumeInput {
	reader: string | null;
}
export type TerminalLegState = ServerLegState & { orderNumber: string; reader: string | null };
export class TerminalPaymentsService {
	private legs = new Map<string, { leg: ServerLeg; orderNumber: string; reader: string | null }>();
	private listeners = new Set<() => void>();
	private snapshot: ReadonlyMap<string, TerminalLegState> = new Map();
	constructor(private options: TerminalPaymentsServiceOptions) {}
	begin(input: BeginInput): ServerLeg {
		return this.create(input, false);
	}
	resume(input: ResumeInput): ServerLeg {
		const existing = this.legs.get(input.orderUuid)?.leg;
		if (existing?.getState().row.id === input.row.id) return existing;
		return this.create({ ...input, reader: null }, true);
	}
	private create(input: BeginInput, resume: boolean): ServerLeg {
		const existing = this.legs.get(input.orderUuid)?.leg;
		if (existing && existing.getState().phase !== 'final')
			throw new Error('Order already has a live terminal leg');
		existing?.dispose();
		const leg = createServerLeg(
			{
				...this.options.http,
				now: this.options.now ?? Date.now,
				setTimeout: this.options.setTimeout ?? setTimeout,
				clearTimeout: this.options.clearTimeout ?? clearTimeout,
				mirror: (response) => this.options.mirror(input.orderUuid, response),
				onFinal: (state) => {
					if (state.outcome === 'captured') this.options.onCaptured?.(input.orderUuid, state.order);
				},
			},
			{ orderId: input.orderId, row: input.row, reader: input.reader, resume }
		);
		this.legs.set(input.orderUuid, { leg, orderNumber: input.orderNumber, reader: input.reader });
		leg.subscribe(() => this.publish());
		this.publish();
		if (!resume) void leg.start();
		return leg;
	}
	get(orderUuid: string): TerminalLegState | null {
		return this.snapshot.get(orderUuid) ?? null;
	}
	dismiss(orderUuid: string): void {
		const entry = this.legs.get(orderUuid);
		if (!entry || entry.leg.getState().phase !== 'final') return;
		entry.leg.dispose();
		this.legs.delete(orderUuid);
		this.publish();
	}
	readersInUse(): Map<string, { orderUuid: string; orderNumber: string }> {
		const readers = new Map<string, { orderUuid: string; orderNumber: string }>();
		this.snapshot.forEach((state, orderUuid) => {
			// The server records the curated reader on the row, so a resumed leg (which
			// began on another till or before a reload) still names the reader it holds.
			const reader = state.row.provider_refs?.reader ?? state.reader;
			if (state.phase !== 'final' && reader)
				readers.set(reader, { orderUuid, orderNumber: state.orderNumber });
		});
		return readers;
	}
	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};
	getSnapshot = () => this.snapshot;
	private publish(): void {
		this.snapshot = new Map(
			[...this.legs].map(([uuid, { leg, orderNumber, reader }]) => [
				uuid,
				{ ...leg.getState(), orderNumber, reader },
			])
		);
		this.listeners.forEach((listener) => listener());
	}
	stop(): void {
		this.legs.forEach(({ leg }) => leg.stop());
	}
}
