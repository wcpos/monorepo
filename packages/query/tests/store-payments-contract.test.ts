import { renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import {
	readStorePaymentsContract,
	useStorePaymentsContract,
} from '../src/store-payments-contract';

import type { RxState } from 'rxdb';

it.each([
	[{ schema: 1, contract: '1.3', methods: [] }, '1.3'],
	[undefined, null],
	[null, null],
	['1.3', null],
	[{ contract: '1.3' }, null],
	[{ schema: 1, contract: 'abc', methods: [] }, null],
] as const)('reads the contract from %j', (paymentMethods, expected) => {
	const state = new BehaviorSubject({ paymentMethods });
	const extraData = { get: (key?: string) => (key ? paymentMethods : state.value), $: state };
	expect(readStorePaymentsContract(extraData)).toBe(expected);
	const { result } = renderHook(() =>
		useStorePaymentsContract(extraData as unknown as RxState<Record<string, unknown>>)
	);
	expect(result.current).toBe(expected);
});
