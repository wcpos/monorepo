import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

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
	const json = order.toJSON();

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
				<EditOrderMetaForm order={json} />
			</TabsContent>
			<TabsContent value="json">
				<Tree value={json} />
			</TabsContent>
		</Tabs>
	);
};
