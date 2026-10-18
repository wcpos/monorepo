import * as React from 'react';

import { readStorePaymentsContract, useQueryRuntime } from '@wcpos/query';

import { createMoneyOwnerHintWriter } from '../pos/commands/money-owner-hint-writer';
import { useStoreSession } from '../../../contexts/app-state';

export function MoneyOwnerHintBridge() {
	const manager = useQueryRuntime();
	const { extraData } = useStoreSession();
	// The engine drains on every route; ownership persistence must outlive the POS.
	React.useEffect(
		() =>
			createMoneyOwnerHintWriter(manager, {
				storeContract: () => readStorePaymentsContract(extraData),
			}),
		[manager, extraData]
	);
	return null;
}
