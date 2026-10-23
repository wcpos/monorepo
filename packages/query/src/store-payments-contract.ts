import { parsePaymentsContract } from '@wcpos/order-math';

import { useDocField } from './records/use-record-field';

import type { ExtraDataSlot } from './user-db/state';

function contractFromEnvelope(value: unknown): string | null {
	if (!value || typeof value !== 'object') return null;
	const envelope = value as Record<string, unknown>;
	return Number.isInteger(envelope.schema) &&
		Array.isArray(envelope.methods) &&
		parsePaymentsContract(envelope.contract)
		? (envelope.contract as string)
		: null;
}

export function useStorePaymentsContract(extraData: ExtraDataSlot): string | null {
	return useDocField(extraData, (state) => contractFromEnvelope(state.paymentMethods));
}
