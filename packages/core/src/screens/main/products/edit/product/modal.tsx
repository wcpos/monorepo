import * as React from 'react';

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
				<ModalContent size="lg">
					<ModalHeader>
						<ModalTitle>{t('products.no_product_found')}</ModalTitle>
					</ModalHeader>
				</ModalContent>
			</Modal>
		);
	}

	return (
		<Modal>
			<ModalContent testID="product-edit-modal" size="lg">
				<ModalHeader>
					{/* The product name is interpolated straight into the heading, so the
				    heading needs the same decode the grid row behind it already does. */}
					<ModalTitle>
						<Text decodeHtml>{t('common.edit_2', { name })}</Text>
					</ModalTitle>
				</ModalHeader>
				<ModalBody>
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
							<EditProductForm product={product} />
						</TabsContent>
						<TabsContent value="json">
							<Tree value={payload} />
						</TabsContent>
					</Tabs>
				</ModalBody>
			</ModalContent>
		</Modal>
	);
}
