import * as React from 'react';

import { type CustomerPayload, type EngineRecord, useQueryRuntime } from '@wcpos/query';
import { readCustomerByWooId } from '@wcpos/query/record-readers';

import { useMutation } from '../../hooks/mutations/use-mutation';

type SaveCustomerAddressesResult =
	| { status: 'saved'; customer: EngineRecord<'customers'> }
	| { status: 'not-found' }
	| { status: 'not-saved' };

/** Cart customer writes keep the resident adapter's queueing and diagnostics. */
export function useCartCustomerRecord() {
	const runtime = useQueryRuntime();
	const { create, patchRecord } = useMutation({
		collectionName: 'customers',
		showSuccessToast: false,
	});
	const createCustomer = React.useCallback(
		(data: Record<string, unknown>): Promise<EngineRecord<'customers'> | undefined> =>
			create({ data }).catch(() => undefined) as Promise<EngineRecord<'customers'> | undefined>,
		[create]
	);
	const saveCustomerAddresses = React.useCallback(
		async (
			wooId: number,
			data: Pick<CustomerPayload, 'billing' | 'shipping' | 'tax_ids'>
		): Promise<SaveCustomerAddressesResult> => {
			const customer = await readCustomerByWooId(runtime.engine, wooId);
			if (!customer) return { status: 'not-found' };
			const savedDoc = await patchRecord({
				document: customer,
				data: {
					billing: data.billing,
					shipping: data.shipping,
					tax_ids: data.tax_ids ?? [],
				},
			});
			return savedDoc ? { status: 'saved', customer } : { status: 'not-saved' };
		},
		[patchRecord, runtime]
	);
	return { createCustomer, saveCustomerAddresses };
}
