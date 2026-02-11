import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { isRxDocument } from 'rxdb';

import { Modal, ModalBody, ModalContent, ModalHeader, ModalTitle } from '@wcpos/components/modal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';
import { Tree } from '@wcpos/components/tree';

import { EditProductForm } from './form';
import { useT } from '../../../../../contexts/translations';

interface Props {
	resource: ObservableResource<import('@wcpos/database').ProductDocument>;
}

export function EditProductModal({ resource }: Props) {
	const product = useObservableSuspense(resource);
	const t = useT();
	const [value, setValue] = React.useState('form');

	if (!isRxDocument(product)) {
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
			<ModalContent size="lg">
				<ModalHeader>
					<ModalTitle>{t('common.edit_2', { name: product.name })}</ModalTitle>
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
							<Tree value={product.toJSON()} />
						</TabsContent>
					</Tabs>
				</ModalBody>
			</ModalContent>
		</Modal>
	);
}
