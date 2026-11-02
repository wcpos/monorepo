import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { observePaymentMethodHistory, useQueryRuntime } from '@wcpos/query';

import { mergePaymentMethodOptions } from './payment-method-options';
import { usePaymentMethods } from './use-payment-methods';

export type { PaymentMethodOption } from './payment-method-options';
/** Resident history stays live across order updates and collection resets. */
export function usePaymentMethodOptions() {
	const runtime = useQueryRuntime();
	const { methods } = usePaymentMethods();
	const orders$ = React.useMemo(
		() => observePaymentMethodHistory(runtime.engine),
		[runtime.engine]
	);
	const observed = useObservableState(orders$, []);
	return React.useMemo(() => mergePaymentMethodOptions(methods, observed), [methods, observed]);
}
