import * as React from 'react';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';
import { Tree } from '@wcpos/components/tree';

import { EditFeeLineForm } from './form';
import { useT } from '../../../../../../contexts/translations';

interface Props {
	uuid: string;
	item: import('@wcpos/database').OrderDocument['fee_lines'][number];
	onClose?: () => void;
}

/**
 *
 */
export const EditFeeLine = ({ uuid, item }: Props) => {
	const t = useT();
	const [value, setValue] = React.useState('form');

	return (
		<Tabs value={value} onValueChange={setValue}>
			<TabsList className="w-full flex-row">
				<TabsTrigger value="form" className="flex-1">
					<Text>{t('Form', { _tags: 'core' })}</Text>
				</TabsTrigger>
				<TabsTrigger value="json" className="flex-1">
					<Text>{t('JSON', { _tags: 'core' })}</Text>
				</TabsTrigger>
			</TabsList>
			<TabsContent value="form">
				<EditFeeLineForm uuid={uuid} item={item} />
			</TabsContent>
			<TabsContent value="json">
				<Tree value={item} />
			</TabsContent>
		</Tabs>
	);
};
