import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { Dialog } from '@wcpos/components/dialog';
import { type EngineRecord, type ReadonlyEngineRecord, useRecordField } from '@wcpos/query';

import { EditCustomerForm } from './form';
import { useT } from '../../../../contexts/translations';
import { RecordDialog } from '../../components/record-dialog';
import { useCustomerNameFormat } from '../../hooks/use-customer-name-format';

interface Props {
	// Mutable by necessity: useEngineRecord returns a mutable resource and ObservableResource is invariant; the value read below is widened to the read-only record.
	resource: ObservableResource<EngineRecord<'customers'> | null>;
}

export function EditCustomer({ resource }: Props) {
	const customer: ReadonlyEngineRecord<'customers'> | null = useObservableSuspense(resource);
	const t = useT();
	const { format } = useCustomerNameFormat();
	const payload = useRecordField(customer, (record) => record.payload);

	return (
		<Dialog route>
			<RecordDialog
				title={
					customer ? t('common.edit_2', { name: format(payload ?? {}) }) : t('common.customer')
				}
				record={customer}
				notFound={t('common.no_customer_found')}
				form={(record) => <EditCustomerForm customer={record} />}
				payload={payload}
			/>
		</Dialog>
	);
}
