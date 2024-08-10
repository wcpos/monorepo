import * as React from 'react';

import { useObservableSuspense, ObservableResource } from 'observable-hooks';

import { ModalContent, ModalTitle, ModalContainer } from '@wcpos/tailwind/src/modal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wcpos/tailwind/src/tabs';
import { Text } from '@wcpos/tailwind/src/text';
import { Tree } from '@wcpos/tailwind/src/tree';

// import { EditOrderForm } from './form';
import { useT } from '../../../../contexts/translations';

interface Props {
	resource: ObservableResource<import('@wcpos/database').ProductDocument>;
}

export const EditProduct = ({ resource }: Props) => {
	const product = useObservableSuspense(resource);
	const t = useT();
	const [value, setValue] = React.useState('form');

	return (
		<ModalContainer>
			<ModalTitle>{t('Edit #{name}', { name: product.name, _tags: 'core' })}</ModalTitle>
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
					<TabsContent value="form">{/* <EditOrderForm order={order} /> */}</TabsContent>
					<TabsContent value="json">
						<Tree data={product.toJSON()} hideRoot />
					</TabsContent>
				</Tabs>
			</ModalContent>
		</ModalContainer>
	);
};
