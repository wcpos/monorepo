import { parsePaymentsContract } from '@wcpos/order-math';

import { useDocField } from './records/use-record-field';

import type { RxState } from 'rxdb';

function contractFromEnvelope(value: unknown): string | null {
	if (!value || typeof value !== 'object') return null;
	const envelope = value as Record<string, unknown>;
	return Number.isInteger(envelope.schema) &&
		Array.isArray(envelope.methods) &&
		parsePaymentsContract(envelope.contract)
		? (envelope.contract as string)
		: null;
}

/** Named store-local read shared by commands and engine host ports. */
export function readStorePaymentsContract(
	extraData: { get(key: string): unknown } | null | undefined
): string | null {
	return contractFromEnvelope(extraData?.get('paymentMethods'));
}

export function useStorePaymentsContract(
	extraData: RxState<Record<string, unknown>>
): string | null {
	return useDocField(extraData, (state) => contractFromEnvelope(state.paymentMethods));
}
