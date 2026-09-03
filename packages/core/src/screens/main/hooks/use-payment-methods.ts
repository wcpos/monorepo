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

type RuntimeEnvelope = { schema: number; contract: string; methods: PaymentMethodDescriptor[] };

function hasMethodId(value: unknown): value is PaymentMethodDescriptor {
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
		Array.isArray(envelope.methods) &&
		envelope.methods.every(hasMethodId)
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
		return {
			methods: value.methods,
			byId: new Map(value.methods.map((method) => [method.id, method])),
			contract: value.contract,
			loaded: true,
			unsupportedSchema: value.schema !== 1,
		};
	}, [paymentMethodsVerified, value]);
}
