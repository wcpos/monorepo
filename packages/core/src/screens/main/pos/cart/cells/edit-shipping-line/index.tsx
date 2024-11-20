import * as React from 'react';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@wcpos/components/src/tabs';
import { Text } from '@wcpos/components/src/text';
import { Tree } from '@wcpos/components/src/tree';

import { EditShippingLineForm } from './form';
import { useT } from '../../../../../../contexts/translations';

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
				<EditShippingLineForm uuid={uuid} item={item} />
			</TabsContent>
			<TabsContent value="json">
				<Tree value={item} />
			</TabsContent>
		</Tabs>
	);
};
