import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { from } from 'rxjs';
import { map } from 'rxjs/operators';

import { useRestHttpClient } from '../../hooks/use-rest-http-client';

export interface WCRefund {
	id?: number;
	date_created?: string;
	reason?: string;
	amount?: string;
	refunded_by?: number | string;
	refunded_payment?: boolean;
	total?: string;
	line_items?: {
		id?: number;
		name?: string;
		sku?: string;
		quantity?: number;
		total?: string;
		total_tax?: string;
		taxes?: { id?: number; total?: string; subtotal?: string }[];
	}[];
	tax_lines?: {
		id?: number;
		label?: string;
		tax_total?: string;
		shipping_tax_total?: string;
	}[];
}

/**
 * The refunds for one order, as a Suspense resource.
 *
 * CANNOT loop across a Suspense retry, and deliberately holds no cache. A resource built during
 * render is only thrown away when the component that built it is INSIDE the boundary that
 * catches the suspension — React unwinds to the boundary and discards the work-in-progress
 * fibers below it. This hook's only caller, `RefundsResourceBoundary` in `../view/modal.tsx`,
 * builds the resource and renders the `Suspense` (and the error boundary) BELOW itself, so it
 * commits alongside the fallback and its `useMemo` survives; the retry reads back the resource
 * whose HTTP GET is already in flight. `use-order-refunds.suspense.test.tsx` pins that, and
 * `packages/query/tests/suspense-resource.test.tsx` pins the general rule.
 *
 * A keyed cache would be the WRONG fix here even though it would also stop a loop: refunds come
 * from an HTTP GET with no live subscription behind it, so an entry keyed by order id would
 * serve a snapshot forever and a refund taken on another till would never appear. The resource
 * is per mount on purpose — every open of the modal asks the server again.
 */
export function useOrderRefunds(orderId: number) {
	const http = useRestHttpClient();

	const observable$ = React.useMemo(
		() => from(http.get(`orders/${orderId}/refunds`)).pipe(map((res) => res.data as WCRefund[])),
		[http, orderId]
	);

	return React.useMemo(
		() => new ObservableResource(observable$) as ObservableResource<WCRefund[]>,
		[observable$]
	);
}
