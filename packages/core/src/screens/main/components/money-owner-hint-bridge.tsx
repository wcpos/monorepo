import * as React from 'react';

import { useQueryRuntime } from '@wcpos/query';

import { createMoneyOwnerHintWriter } from '../pos/commands/money-owner-hint-writer';

export function MoneyOwnerHintBridge() {
	const manager = useQueryRuntime();
	// The engine drains on every route; ownership persistence must outlive the POS.
	React.useEffect(() => createMoneyOwnerHintWriter(manager), [manager]);
	return null;
}
