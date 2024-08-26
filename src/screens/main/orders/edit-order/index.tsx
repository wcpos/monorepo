import * as React from 'react';

import { useObservableSuspense, ObservableResource } from 'observable-hooks';

import { ModalContent, ModalTitle, ModalContainer } from '@wcpos/components/src/modal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wcpos/components/src/tabs';
import { Text } from '@wcpos/components/src/text';
import { Tree } from '@wcpos/components/src/tree';

import { EditOrderForm } from './form';
import { useT } from '../../../../contexts/translations';

interface Props {
	resource: ObservableResource<import('@wcpos/database').OrderDocument>;
}

export const EditOrder = ({ resource }: Props) => {
	const order = useObservableSuspense(resource);
	const t = useT();
	const [value, setValue] = React.useState('form');

	return (
		<ModalContainer>
			<ModalTitle>
				{order.id
					? t('Edit Order #{number}', { number: order.id, _tags: 'core' })
					: t('Edit Order', { _tags: 'core' })}
			</ModalTitle>
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
						<EditOrderForm order={order} />
					</TabsContent>
					<TabsContent value="json">
						<Tree value={order.toJSON()} />
					</TabsContent>
				</Tabs>
			</ModalContent>
		</ModalContainer>
	);
};
