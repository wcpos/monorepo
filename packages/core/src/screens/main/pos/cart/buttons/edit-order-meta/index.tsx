import * as React from 'react';

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
}

/**
 *
 */
export function EditOrderMeta({ order }: Props) {
	const t = useT();
	const [value, setValue] = React.useState('form');

	/**
	 * We need to refresh the component when the order data changes
	 */
	const payload = useRecordField(order, (record) => record.payload);
	const formData = React.useMemo(() => {
		return {
			status: payload.status,
			cashier_id: wooMetaCarrier.readIdentity(payload.meta_data).cashierId ?? '',
			customer_note: payload.customer_note ?? '',
			currency: payload.currency,
			transaction_id: payload.transaction_id,
			meta_data: payload.meta_data,
		};
	}, [payload]);

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
				<EditOrderMetaForm
					order={order}
					formData={formData as React.ComponentProps<typeof EditOrderMetaForm>['formData']}
				/>
			</TabsContent>
			<TabsContent value="json" className="min-h-0 flex-1">
				<DialogBody>
					<Tree value={payload} />
				</DialogBody>
			</TabsContent>
		</Tabs>
	);
}
