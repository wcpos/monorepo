import * as React from 'react';

import { useObservableSuspense, ObservableResource } from 'observable-hooks';

import { ModalContent, ModalTitle, ModalContainer, ModalHeader } from '@wcpos/components/src/modal';
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

	return (
		<ModalContainer>
			<ModalHeader>
				<ModalTitle>{t('Edit #{name}', { name: product.name, _tags: 'core' })}</ModalTitle>
			</ModalHeader>
			<ModalContent>
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
			</ModalContent>
		</ModalContainer>
	);
};
