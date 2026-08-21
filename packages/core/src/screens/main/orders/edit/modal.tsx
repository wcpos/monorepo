import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { Modal, ModalBody, ModalContent, ModalHeader, ModalTitle } from '@wcpos/components/modal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';
import { Tree } from '@wcpos/components/tree';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { EditOrderForm } from './form';
import { useT } from '../../../../contexts/translations';

interface Props {
	resource: ObservableResource<EngineRecord<'orders'> | null>;
}

export function EditOrderModal({ resource }: Props) {
	const order = useObservableSuspense(resource);
	const t = useT();
	const [value, setValue] = React.useState('form');
	const payload = useRecordField(order, (record) => record.payload);

	if (!order) {
		return (
			<Modal>
				<ModalContent size="xl">
					<ModalHeader>
						<ModalTitle>
							<Text>{t('common.no_order_found')}</Text>
						</ModalTitle>
					</ModalHeader>
				</ModalContent>
			</Modal>
		);
	}

	return (
		<Modal>
			<ModalContent size="xl">
				<ModalHeader>
					<ModalTitle>
						<Text>
							{payload?.id
								? t('orders.edit_order_2', { number: payload.id })
								: t('orders.edit_order')}
						</Text>
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
							<EditOrderForm order={order} />
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
