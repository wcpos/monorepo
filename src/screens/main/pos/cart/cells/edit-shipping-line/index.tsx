import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@wcpos/tailwind/src/tabs';
import { Text } from '@wcpos/tailwind/src/text';
import { Tree } from '@wcpos/tailwind/src/tree';

import { EditShippingLineForm } from './form';
import { useT } from '../../../../../../contexts/translations';
// import { AmountWidget } from '../../../components/amount-widget';
// import { TaxClassSelect } from '../../../components/tax-class-select';
// import { useCurrentOrder } from '../../contexts/current-order';
// import { useFeeLineData } from '../../hooks/use-fee-line-data';
// import { useUpdateFeeLine } from '../../hooks/use-update-fee-line';

interface Props {
	uuid: string;
	item: import('@wcpos/database').OrderDocument['shipping_lines'][number];
	onClose?: () => void;
}

/**
 *
 */
export const EditShippingLine = ({ uuid, item, onClose }: Props) => {
	const t = useT();
	const [value, setValue] = React.useState('form');

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
				<EditShippingLineForm />
			</TabsContent>
			<TabsContent value="json">
				<Tree data={item} />
			</TabsContent>
		</Tabs>
	);
};
