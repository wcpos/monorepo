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
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as { id?: unknown }).id === 'string'
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
	const { extraData, paymentMethodsVerified } = useExtraData();
	const value = useDocField(extraData, (document) => document.paymentMethods);

	return React.useMemo(() => {
		if (!paymentMethodsVerified || !isEnvelope(value)) {
			return {
				methods: [],
				byId: new Map<string, PaymentMethodDescriptor>(),
				contract: null,
				loaded: false,
				unsupportedSchema: false,
			};
		}
		const methods = value.methods.filter(isDescriptor);
		return {
			methods,
			byId: new Map(methods.map((method) => [method.id, method])),
			contract: value.contract,
			loaded: true,
			unsupportedSchema: value.schema !== 1,
		};
	}, [paymentMethodsVerified, value]);
}
