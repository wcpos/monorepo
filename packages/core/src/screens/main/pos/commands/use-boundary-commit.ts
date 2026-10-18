import * as React from 'react';

import type { EngineRecord } from '@wcpos/query';

import { useRegisterBinding } from '../../../../services/register/use-register-binding';
import { useSaleContext } from '../checkout/hooks/use-sale-context';
import { useCompleteOrderFlowForOrder } from '../checkout/hooks/use-complete-order-flow';
import { useCartConfigReader } from '../hooks/use-cart-config';
import {
	useServerOwnsMoneyReader,
	useStoreContractReader,
} from '../contexts/order-money-divergence';
import { commitAtBoundary } from './boundary-commit';

import type { BoundaryResult } from './paid-balance-boundary';
import type { CurrentOrderRecord } from '../contexts/current-order';
import type { OrderMutationContext } from '../hooks/order-mutation-queue';

export function useBoundaryCommit(write: ReturnType<typeof useSaleContext>['localPatch']) {
	const ctx = useSaleContext();
	const storeContract = useStoreContractReader();
	const configForOrder = useCartConfigReader();
	const serverOwnsMoney = useServerOwnsMoneyReader();
	const { status } = useRegisterBinding();
	const complete = useCompleteOrderFlowForOrder();
	return React.useCallback(
		(order: CurrentOrderRecord, result: BoundaryResult, queue: OrderMutationContext) =>
			commitAtBoundary(
				{
					...ctx,
					configForOrder,
					serverOwnsMoney,
					storeContract,
					bindingStatus: status === 'unknown' ? 'none' : status,
					complete: (target, slot) => complete(target, { source: 'zero-balance' }, slot),
				},
				{
					order: order as EngineRecord<'orders'>,
					result,
					queue,
					// Coupon carts belong to the continuation, including arrivals during guards.
					allowed: (payload) => !payload.coupon_lines?.some((line) => line.code != null),
					write: (changes) => write({ document: order, changes }),
				}
			),
		[ctx, status, complete, write, configForOrder, serverOwnsMoney, storeContract]
	);
}
