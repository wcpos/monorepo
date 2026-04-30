import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { from } from 'rxjs';
import { map } from 'rxjs/operators';

import { useRestHttpClient } from '../../hooks/use-rest-http-client';

export interface WCRefund {
	id?: number;
	date_created?: string;
	reason?: string;
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
