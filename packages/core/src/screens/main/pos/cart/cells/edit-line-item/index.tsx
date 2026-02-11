import * as React from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';
import { Tree } from '@wcpos/components/tree';

import { EditLineItemForm } from './form';
import { useT } from '../../../../../../contexts/translations';

interface Props {
	uuid: string;
	item: NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
	onClose?: () => void;
}

/**
 *
 */
export function EditLineItem({ uuid, item, onClose }: Props) {
	const t = useT();
	const [value, setValue] = React.useState('form');

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
				<EditLineItemForm uuid={uuid} item={item} />
			</TabsContent>
			<TabsContent value="json">
				<Tree value={item} />
			</TabsContent>
		</Tabs>
	);
}
