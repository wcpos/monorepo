import * as React from 'react';

import { SavedFieldProvider } from '@wcpos/components/form';
import { DialogBody } from '@wcpos/components/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';
import { Tree } from '@wcpos/components/tree';
import { useRecordField } from '@wcpos/query';
import { wooMetaCarrier } from '@wcpos/sync-core';

import { EditOrderMetaForm } from './form';
import { useT } from '../../../../../../contexts/translations';

import type { CurrentOrderRecord } from '../../../contexts/current-order';

interface Props {
	order: CurrentOrderRecord;
	/** The autosave's flush, for the sheet's Sync order (see `EditOrderMetaForm`). */
	flushRef?: React.RefObject<(() => Promise<boolean>) | null>;
}

/**
 *
 */
export function EditOrderMeta({ order, flushRef }: Props) {
	const t = useT();
	const [value, setValue] = React.useState('form');

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
		<Tabs value={value} onValueChange={setValue} className="min-h-0 flex-1 gap-4">
			<TabsList className="mx-4 flex-row">
				<TabsTrigger value="form" className="flex-1">
					<Text>{t('common.form')}</Text>
				</TabsTrigger>
				<TabsTrigger value="json" className="flex-1">
					<Text>{t('common.json')}</Text>
				</TabsTrigger>
			</TabsList>
			<TabsContent value="form" className="min-h-0 flex-1 gap-4">
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
			</TabsContent>
			<TabsContent value="json" className="min-h-0 flex-1">
				<DialogBody>
					<Tree value={payload} />
				</DialogBody>
			</TabsContent>
		</Tabs>
	);
}
