import * as React from 'react';

import { useDocField } from '@wcpos/query';
import type { PaymentMethodDescriptor } from '@wcpos/order-math';

import { useExtraData } from '../contexts/extra-data';

export interface PaymentMethodsState {
	methods: PaymentMethodDescriptor[];
	byId: ReadonlyMap<string, PaymentMethodDescriptor>;
	contract: string | null;
	loaded: boolean;
	/** Contract §13: schema !== 1 → the app must refuse to take payments until updated. */
	unsupportedSchema: boolean;
}

type RuntimeEnvelope = { schema: number; contract: string; methods: unknown[] };

/**
 * A descriptor without a string `id` cannot be keyed, rendered or recorded against —
 * `byId` and every tender tile read `method.id`. Drop just that row, never the envelope:
 * one malformed gateway must not stop the till taking cash on the methods that are fine.
 * (Contract §13 is about UNKNOWN enum values, which stay and are disabled with a reason;
 * this guard is only for structurally unusable rows.)
 */
function isDescriptor(value: unknown): value is PaymentMethodDescriptor {
	if (typeof value !== 'object' || value === null) return false;
	const row = value as { id?: unknown; kind?: unknown; capture?: unknown; capabilities?: unknown };
	// The tender tiles dereference capture.mode and capabilities.offline unconditionally, so a
	// row must carry those objects to be renderable; their VALUES may be anything (§13).
	return (
		typeof row.id === 'string' &&
		typeof row.kind === 'string' &&
		typeof row.capture === 'object' &&
		row.capture !== null &&
		typeof (row.capture as { mode?: unknown }).mode === 'string' &&
		typeof row.capabilities === 'object' &&
		row.capabilities !== null
	);
}

function isEnvelope(value: unknown): value is RuntimeEnvelope {
	if (!value || typeof value !== 'object') return false;
	const envelope = value as Record<string, unknown>;
	return (
		Number.isInteger(envelope.schema) &&
		typeof envelope.contract === 'string' &&
		Array.isArray(envelope.methods)
	);
}

export function usePaymentMethods(): PaymentMethodsState {
	const { extraData } = useExtraData();
	const value = useDocField(extraData, (document) => document.paymentMethods);

	return React.useMemo(() => {
		if (!isEnvelope(value)) {
			return {
				methods: [],
				byId: new Map<string, PaymentMethodDescriptor>(),
				contract: null,
				loaded: false,
				unsupportedSchema: false,
			};
		}
		const methods = value.methods.filter(isDescriptor);
		// A store that advertised methods but none survived the guard is a broken payload, not an
		// empty till: keep the legacy checkout rather than strand the cashier on an empty grid.
		if (value.methods.length > 0 && methods.length === 0) {
			return {
				methods: [],
				byId: new Map<string, PaymentMethodDescriptor>(),
				contract: value.contract,
				loaded: false,
				unsupportedSchema: value.schema !== 1,
			};
		}
		return {
			methods,
			byId: new Map(methods.map((method) => [method.id, method])),
			contract: value.contract,
			loaded: true,
			unsupportedSchema: value.schema !== 1,
		};
	}, [value]);
}
