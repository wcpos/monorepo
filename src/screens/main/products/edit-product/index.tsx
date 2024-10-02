import * as React from 'react';

import {
	useObservableSuspense,
	ObservableResource,
	useObservableEagerState,
} from 'observable-hooks';

import {
	Modal,
	ModalContent,
	ModalTitle,
	ModalHeader,
	ModalBody,
} from '@wcpos/components/src/modal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wcpos/components/src/tabs';
import { Text } from '@wcpos/components/src/text';
import { Tree } from '@wcpos/components/src/tree';

// import { EditOrderForm } from './form';
import { EditProductForm } from './form';
import { useT } from '../../../../contexts/translations';
import useModalRefreshFix from '../../../../hooks/use-modal-refresh-fix';

interface Props {
	resource: ObservableResource<import('@wcpos/database').ProductDocument>;
}

export const EditProduct = ({ resource }: Props) => {
	const product = useObservableSuspense(resource);
	const t = useT();
	const [value, setValue] = React.useState('form');
	useModalRefreshFix();
	useObservableEagerState(product.date_modified_gmt$);

	return (
		<Modal>
			<ModalContent size="lg">
				<ModalHeader>
					<ModalTitle>
						<Text>{t('Edit {name}', { name: product.name, _tags: 'core' })}</Text>
					</ModalTitle>
				</ModalHeader>
				<ModalBody>
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
};
