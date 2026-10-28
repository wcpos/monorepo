import * as React from 'react';

import { SavedFieldProvider } from '@wcpos/components/form';
import { useRecordField } from '@wcpos/query';
import { wooMetaCarrier } from '@wcpos/sync-core';

import { EditOrderMetaForm } from './form';

import type { CurrentOrderRecord } from '../../../contexts/current-order';

interface Props {
	order: CurrentOrderRecord;
	/** The autosave's flush, for the sheet's Sync order (see `EditOrderMetaForm`). */
	flushRef?: React.RefObject<(() => Promise<boolean>) | null>;
}

/** The order sheet's Form tab: the fields that save as they change, and the two sends. */
export function EditOrderMeta({ order, flushRef }: Props) {
	/**
	 * We need to refresh the component when the order data changes
	 */
	const payload = useRecordField(order, (record) => record.payload);
	const formData = React.useMemo(() => {
		return {
			customer_note: payload.customer_note ?? '',
			currency: payload.currency,
			meta_data: payload.meta_data,
		};
	}, [payload]);

	// The two sends, kept apart from the fields that save as they change.
	const handOverData = React.useMemo(
		() => ({
			status: payload.status ?? '',
			cashier_id: wooMetaCarrier.readIdentity(payload.meta_data).cashierId ?? '',
		}),
		[payload]
	);

	return (
		<SavedFieldProvider>
			{/* Keyed per order: the form holds its own draft (defaultValues) while it is open. */}
			<EditOrderMetaForm
				key={order.uuid}
				order={order}
				formData={formData as React.ComponentProps<typeof EditOrderMetaForm>['formData']}
				handOverData={handOverData}
				flushRef={flushRef}
			/>
		</SavedFieldProvider>
	);
}
