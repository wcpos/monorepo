import * as React from 'react';
import { View } from 'react-native';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { Modal, ModalBody, ModalContent, ModalHeader, ModalTitle } from '@wcpos/components/modal';
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
			<Modal>
				<ModalContent side="right" size="lg">
					<ModalHeader>
						<ModalTitle>{t('products.no_product_found')}</ModalTitle>
					</ModalHeader>
				</ModalContent>
			</Modal>
		);
	}

	return (
		<Modal>
			<ModalContent side="right" testID="product-edit-modal" size="lg">
				<ModalHeader>
					{/* The product name is interpolated straight into the heading, so the
				    heading needs the same decode the grid row behind it already does. */}
					<ModalTitle>
						<Text decodeHtml>{t('common.edit_2', { name })}</Text>
					</ModalTitle>
				</ModalHeader>
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
							<ModalBody>
								<Tree value={payload} />
							</ModalBody>
						</TabsContent>
					</Tabs>
				</View>
			</ModalContent>
		</Modal>
	);
}
