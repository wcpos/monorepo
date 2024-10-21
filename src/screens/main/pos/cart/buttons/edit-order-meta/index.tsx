import * as React from 'react';

import { useObservablePickState } from 'observable-hooks';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@wcpos/components/src/tabs';
import { Text } from '@wcpos/components/src/text';
import { Tree } from '@wcpos/components/src/tree';

import { EditOrderMetaForm } from './form';
import { useT } from '../../../../../../contexts/translations';

interface Props {
	order: import('@wcpos/database').OrderDocument;
}

/**
 *
 */
export const EditOrderMeta = ({ order }: Props) => {
	const t = useT();
	const [value, setValue] = React.useState('form');

	/**
	 * We need to refresh the component when the order data changes
	 */
	const formData = useObservablePickState(
		order.$,
		() => {
			const latest = order.getLatest();
			return {
				currency: latest.currency,
				transaction_id: latest.transaction_id,
				meta_data: latest.meta_data,
			};
		},
		'currency',
		'transaction_id',
		'meta_data'
	);

	return (
		<Tabs value={value} onValueChange={setValue}>
			<TabsList className="flex-row w-full">
				<TabsTrigger value="form" className="flex-1">
					<Text>{t('Form', { _tags: 'core' })}</Text>
				</TabsTrigger>
				<TabsTrigger value="json" className="flex-1">
					<Text>{t('JSON', { _tags: 'core' })}</Text>
				</TabsTrigger>
			</TabsList>
			<TabsContent value="form">
				<EditOrderMetaForm order={order} formData={formData} />
			</TabsContent>
			<TabsContent value="json">
				<Tree value={order.getLatest().toJSON()} />
			</TabsContent>
		</Tabs>
	);
};
