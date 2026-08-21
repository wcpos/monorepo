import * as React from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';
import { Tree } from '@wcpos/components/tree';
import { useRecordField } from '@wcpos/query';

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
			currency: payload.currency,
			transaction_id: payload.transaction_id,
			meta_data: payload.meta_data,
		};
	}, [payload]);

	return (
		<Tabs value={value} onValueChange={setValue}>
			<TabsList className="w-full flex-row">
				<TabsTrigger value="form" className="flex-1">
					<Text>{t('common.form')}</Text>
				</TabsTrigger>
				<TabsTrigger value="json" className="flex-1">
					<Text>{t('common.json')}</Text>
				</TabsTrigger>
			</TabsList>
			<TabsContent value="form">
				<EditOrderMetaForm
					order={order}
					formData={formData as React.ComponentProps<typeof EditOrderMetaForm>['formData']}
				/>
			</TabsContent>
			<TabsContent value="json">
				<Tree value={payload} />
			</TabsContent>
		</Tabs>
	);
}
