import * as React from 'react';

import type { MetaDataEntry } from '@wcpos/order-math';
import type { WriteTarget } from '@wcpos/query/mutations';

import { type PayloadChanges, useLocalMutation } from '../../hooks/mutations/use-local-mutation';

/** Keep the adapter's call-time register stamp and failed-write result unchanged. */
export function useOrderLedgerWrite() {
	const { localPatch } = useLocalMutation();
	const recordLedger = React.useCallback(
		(
			order: WriteTarget,
			data:
				| { meta_data: MetaDataEntry[]; status: string; fee_lines?: object[]; total?: string }
				| { fee_lines: object[]; total: string }
		) => localPatch({ document: order, data }),
		[localPatch]
	);
	const stampCompletion = React.useCallback(
		(order: WriteTarget, meta_data: MetaDataEntry[]) =>
			localPatch({ document: order, data: { meta_data } }),
		[localPatch]
	);
	// The zero-balance completion (#2710, ADR 0033 item 4) resolves its changes inside the
	// adapter's slot — pre-flight and every retry — so this door passes the resolver through.
	const writeLedgerChanges = React.useCallback(
		(order: WriteTarget, changes: PayloadChanges) => localPatch({ document: order, changes }),
		[localPatch]
	);
	return { recordLedger, stampCompletion, writeLedgerChanges };
}
