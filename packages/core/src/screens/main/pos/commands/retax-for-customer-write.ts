import isEqual from 'lodash/isEqual';

import { hasLiveSettlementLeg, retaxCartLines, serverOwnsMoney } from '@wcpos/order-math';
import { wooMetaCarrier } from '@wcpos/sync-core';
import type { CartConfig, EngineWarning, LineItemInput, TaxStatus } from '@wcpos/order-math';

import type { OrderPayload } from './cart-config-for-order';

type Lines = Pick<ReturnType<typeof retaxCartLines>, 'line_items' | 'fee_lines'>;

/** A customer write that moves the rates re-taxes the lines in the same write (#1875). */
export function retaxForCustomerWrite(
	current: OrderPayload,
	intent: object,
	deps: {
		configForOrder: (order: OrderPayload) => CartConfig;
		ownedElsewhere: boolean;
		taxStatusFor: (line: LineItemInput) => TaxStatus | undefined;
	}
): { lines: Lines; warnings: readonly EngineWarning[] } {
	const none = { lines: {}, warnings: [] };
	// The address is still written; a server-owned or mid-settlement order's figures are the server's.
	const { meta_data } = current;
	if (deps.ownedElsewhere || serverOwnsMoney(meta_data) || hasLiveSettlementLeg(meta_data))
		return none;
	// An exempt order keeps its lines: on an inclusive store config.vatExempt is false (roadmap#477).
	if (wooMetaCarrier.vatExempt(meta_data)) return none;
	// As settleCartWrite: an undefined field keeps the order's current value.
	const defined = Object.entries(intent).filter(([, value]) => value !== undefined);
	const config = deps.configForOrder({ ...current, ...Object.fromEntries(defined) });
	if (isEqual(deps.configForOrder(current).rates, config.rates)) return none;
	const { taxStatusFor } = deps;
	const {
		changed: _changed,
		warnings,
		...lines
	} = retaxCartLines(current, config, { taxStatusFor });
	return { lines, warnings };
}
