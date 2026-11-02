import { isRecordUuid } from '@wcpos/sync-core';

type OrderSnapshot = Record<string, unknown> & { id: number; status: string };

/**
 * What the legacy pay page told the till, named once. The store posts `wcpos-payment-received`
 * with the order (Free `templates/received.php`) and `wcpos-payment-blocked` with a refusal;
 * Pro's order-pay panel posts `wcpos-session-expired`. Any other action carrying `payload.data`
 * is still a refusal: third-party senders are unknown, and that tolerance has always shipped.
 */
export type PayPageMessage =
	| { kind: 'received'; snapshot: OrderSnapshot }
	| { kind: 'received-unreadable' }
	| {
			kind: 'blocked' | 'refused';
			action: unknown;
			message?: string;
			payload: Record<string, unknown>;
	  }
	| { kind: 'session-expired'; orderId: number }
	| { kind: 'ignored' };

/** A plain order object the store stamped with this till's uuid: the only snapshot worth adopting. */
function isOrderSnapshot(payload: unknown): payload is OrderSnapshot {
	if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return false;
	const candidate = payload as Record<string, unknown>;
	const prototype = Object.getPrototypeOf(payload);
	return (
		(prototype === Object.prototype || prototype === null) &&
		typeof candidate.id === 'number' &&
		Number.isFinite(candidate.id) &&
		candidate.id > 0 &&
		typeof candidate.status === 'string' &&
		candidate.status.trim() !== '' &&
		Array.isArray(candidate.meta_data) &&
		candidate.meta_data.some(
			(meta) =>
				meta !== null &&
				typeof meta === 'object' &&
				(meta as Record<string, unknown>).key === '_woocommerce_pos_uuid' &&
				isRecordUuid((meta as Record<string, unknown>).value)
		)
	);
}

/** Decode one inbound frame message. Session expiry is read first; a refusal before receipt. */
export function readPayPageMessage(data: unknown): PayPageMessage {
	const message = data as { action?: unknown; payload?: unknown; orderId?: unknown } | null;
	const action = message?.action;
	if (action === 'wcpos-session-expired') {
		return { kind: 'session-expired', orderId: Number(message?.orderId) };
	}
	const payload = message?.payload as Record<string, unknown> | undefined;
	if (action !== 'wcpos-payment-received' && payload?.data) {
		const text = payload.message;
		return {
			kind: action === 'wcpos-payment-blocked' ? 'blocked' : 'refused',
			action,
			payload,
			...(typeof text === 'string' && text.trim() !== '' ? { message: text } : {}),
		};
	}
	if (action === 'wcpos-payment-received') {
		return isOrderSnapshot(payload)
			? { kind: 'received', snapshot: payload }
			: { kind: 'received-unreadable' };
	}
	return { kind: 'ignored' };
}
