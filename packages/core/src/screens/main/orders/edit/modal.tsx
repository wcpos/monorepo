import * as React from 'react';

import { useObservableSuspense, ObservableResource } from 'observable-hooks';
import { isRxDocument } from 'rxdb';

import { ModalContent, ModalTitle, Modal, ModalBody, ModalHeader } from '@wcpos/components/modal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';
import { Tree } from '@wcpos/components/tree';

import { EditOrderForm } from './form';
import { useT } from '../../../../contexts/translations';

interface Props {
	resource: ObservableResource<import('@wcpos/database').OrderDocument>;
}

export const EditOrderModal = ({ resource }: Props) => {
	const order = useObservableSuspense(resource);
	const t = useT();
	const [value, setValue] = React.useState('form');

	if (!isRxDocument(order)) {
		return (
			<Modal>
				<ModalContent size="lg">
					<ModalHeader>
						<ModalTitle>
							<Text>{t('No order found', { _tags: 'core' })}</Text>
						</ModalTitle>
					</ModalHeader>
				</ModalContent>
			</Modal>
		);
	}

	return (
		<Modal>
			<ModalContent size="lg">
				<ModalHeader>
					<ModalTitle>
						<Text>
							{order.id
								? t('Edit Order #{number}', { number: order.id, _tags: 'core' })
								: t('Edit Order', { _tags: 'core' })}
						</Text>
					</ModalTitle>
				</ModalHeader>
				<ModalBody>
					<Tabs value={value} onValueChange={setValue}>
						<TabsList className="w-full flex-row">
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
				</ModalBody>
			</ModalContent>
		</Modal>
	);
};
