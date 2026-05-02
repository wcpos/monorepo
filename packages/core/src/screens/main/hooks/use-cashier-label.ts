import { useObservable, useObservableState } from 'observable-hooks';
import { of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { useCollection } from './use-collection';
import { useCustomerNameFormat } from './use-customer-name-format';

type CustomerDocument = import('@wcpos/database').CustomerDocument;

type CashierDocument = CustomerDocument | null | undefined;

interface CashierLabel {
	id: number | undefined;
	label: string;
	document: CustomerDocument | undefined;
}

/**
 * Normalize remote ids that can arrive from order metadata as numbers or numeric strings.
 */
export function parseRemoteId(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
		return value;
	}

	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	if (!trimmed || !/^\d+$/.test(trimmed)) {
		return undefined;
	}

	return Number(trimmed);
}

/**
 * Resolve a cashier id to a display label.
 *
 * Cashiers currently live in the customers collection. Keeping this lookup behind a hook lets us
 * move to a dedicated cashiers collection later without changing order UI components.
 */
export function useCashierLabel(value: unknown): CashierLabel {
	const id = parseRemoteId(value);
	const { collection } = useCollection('customers');
	const { format } = useCustomerNameFormat();

	const cashier$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(([cashierID, customerCollection]) => {
					if (cashierID === undefined) {
						return of(undefined);
					}

					return customerCollection.findOne({ selector: { id: cashierID } }).$;
				})
			),
		[id, collection]
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
