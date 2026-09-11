import * as React from 'react';

import { DialogBody } from '@wcpos/components/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';
import { Tree } from '@wcpos/components/tree';

import { EditShippingLineForm } from './form';
import { useT } from '../../../../../../contexts/translations';

interface Props {
	uuid: string;
	item: NonNullable<import('@wcpos/database').OrderDocument['shipping_lines']>[number];
	onClose?: () => void;
}

/**
 *
 */
export function EditShippingLine({ uuid, item, onClose }: Props) {
	const t = useT();
	const [value, setValue] = React.useState('form');

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
				<EditShippingLineForm uuid={uuid} item={item} />
			</TabsContent>
			<TabsContent value="json" className="min-h-0 flex-1">
				<DialogBody>
					<Tree value={item} />
				</DialogBody>
			</TabsContent>
		</Tabs>
	);
}
