import * as React from 'react';

import { useRegisterBinding } from '../../../../services/register/use-register-binding';
import { useSaleContext } from '../checkout/hooks/use-sale-context';
import { useCompleteOrderFlowForOrder } from '../checkout/hooks/use-complete-order-flow';
import { completeSale } from '../checkout/sale-completion';
import { useCartConfigReader } from '../hooks/use-cart-config';
import { useServerOwnsMoneyReader } from '../contexts/order-money-divergence';
import { commitAtBoundary } from './boundary-commit';
import { useCloseSale } from './close-sale';

export type BoundaryCommitter = (
	input: Parameters<typeof commitAtBoundary>[1]
) => ReturnType<typeof commitAtBoundary>;

/**
 * The till's boundary commit for one source. `user` completes through the cashier's flow;
 * `system` runs with nobody at the till and completes in the background. The binding is read
 * when the commit runs, so a rebind never changes the committer's identity.
 */
export function useBoundaryCommitter(source: 'user' | 'system'): BoundaryCommitter {
	const saleContext = useSaleContext();
	const configForOrder = useCartConfigReader();
	const serverOwnsMoney = useServerOwnsMoneyReader();
	const { status, registerId } = useRegisterBinding();
	const binding = React.useRef({ status, registerId });
	React.useLayoutEffect(() => {
		binding.current = { status, registerId };
	}, [status, registerId]);
	const foreground = useCompleteOrderFlowForOrder();
	const closeSale = useCloseSale();
	return React.useCallback(
		(input) => {
			// A commit has no unknown verdict: an unresolved binding commits as unbound.
			const readBindingStatus = () =>
				binding.current.status === 'unknown' ? 'none' : binding.current.status;
			return commitAtBoundary(
				{
					...saleContext,
					source,
					configForOrder,
					serverOwnsMoney,
					bindingStatus: readBindingStatus(),
					readBindingStatus,
					readRegisterId: () => binding.current.registerId,
					complete:
						source === 'system'
							? (order, outcome, slot) =>
									completeSale(saleContext, order, outcome, { host: 'background' }, slot)
							: foreground,
					closeSale,
				},
				input
			);
		},
		[saleContext, source, configForOrder, serverOwnsMoney, foreground, closeSale]
	);
}
