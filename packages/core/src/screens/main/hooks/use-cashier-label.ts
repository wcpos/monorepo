import { useObservable, useObservableState } from 'observable-hooks';
import { of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { parseRemoteId } from '../../../utils/parse-remote-id';
import { useCollection } from './use-collection';
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
