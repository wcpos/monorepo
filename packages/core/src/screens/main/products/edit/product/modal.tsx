import * as React from 'react';
import { View } from 'react-native';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';
import { Tree } from '@wcpos/components/tree';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { EditProductForm } from './form';
import { useT } from '../../../../../contexts/translations';

interface Props {
	resource: ObservableResource<EngineRecord<'products'> | null>;
}

export function EditProductModal({ resource }: Props) {
	const product = useObservableSuspense(resource);
	const t = useT();
	const [value, setValue] = React.useState('form');
	const name = useRecordField(product, (record) => record.payload.name);
	const payload = useRecordField(product, (record) => record.payload);

	if (!product) {
		return (
			<Dialog route>
				<DialogContent side="right" size="lg">
					<DialogHeader>
						<DialogTitle>{t('products.no_product_found')}</DialogTitle>
					</DialogHeader>
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Dialog route>
			<DialogContent side="right" testID="product-edit-modal" size="lg">
				<DialogHeader>
					{/* The product name is interpolated straight into the heading, so the
				    heading needs the same decode the grid row behind it already does. */}
					<DialogTitle>
						<Text decodeHtml>{t('common.edit_2', { name })}</Text>
					</DialogTitle>
				</DialogHeader>
				<View className="min-h-0 flex-1">
					<Tabs className="min-h-0 flex-1" value={value} onValueChange={setValue}>
						<TabsList className="mx-4 flex-row">
							<TabsTrigger value="form" className="flex-1">
								<Text>{t('common.form')}</Text>
							</TabsTrigger>
							<TabsTrigger value="json" className="flex-1">
								<Text>{t('common.json')}</Text>
							</TabsTrigger>
						</TabsList>
						<TabsContent value="form" className="min-h-0 flex-1">
							<EditProductForm product={product} />
						</TabsContent>
						<TabsContent value="json" className="min-h-0 flex-1">
							<DialogBody>
								<Tree value={payload} />
							</DialogBody>
						</TabsContent>
					</Tabs>
				</View>
			</DialogContent>
		</Dialog>
	);
}
