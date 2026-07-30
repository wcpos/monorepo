import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { of } from 'rxjs';

import { useQueryManager } from '@wcpos/query';

import { engineDocumentByWooId$ } from './use-engine-document';
import { parseRemoteId } from '../../../utils/parse-remote-id';
import { useCustomerNameFormat } from './use-customer-name-format';

export { parseRemoteId } from '../../../utils/parse-remote-id';

type CustomerDocument = import('@wcpos/database').CustomerDocument;

type CashierDocument = CustomerDocument | null | undefined;

interface CashierLabel {
	id: number | undefined;
	label: string;
	document: CustomerDocument | undefined;
}

/**
 * Resolve a cashier id to a display label.
 *
 * Cashiers currently live in the customers collection. Keeping this lookup behind a hook lets us
 * move to a dedicated cashiers collection later without changing order UI components.
 */
export function useCashierLabel(value: unknown): CashierLabel {
	const id = parseRemoteId(value);
	const manager = useQueryManager();
	const { format } = useCustomerNameFormat();

	const cashier$ = React.useMemo(
		() =>
			id === undefined
				? of(undefined)
				: engineDocumentByWooId$<CustomerDocument>(manager, 'customers', id),
		[id, manager]
	);
	const cashier = useObservableState(cashier$, undefined) as CashierDocument;

	if (id === undefined) {
		return { id, label: '', document: undefined };
	}

	if (cashier) {
		return { id, label: format(cashier), document: cashier };
	}

	return { id, label: format({ id }), document: undefined };
}
