import * as React from 'react';
import { View } from 'react-native';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { Modal, ModalBody, ModalContent, ModalHeader, ModalTitle } from '@wcpos/components/modal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';
import { Tree } from '@wcpos/components/tree';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { EditCustomerForm } from './form';
import { useT } from '../../../../contexts/translations';
import { useCustomerNameFormat } from '../../hooks/use-customer-name-format';

interface Props {
	resource: ObservableResource<EngineRecord<'customers'> | null>;
}

export function EditCustomer({ resource }: Props) {
	const customer = useObservableSuspense(resource);
	const t = useT();
	const [value, setValue] = React.useState('form');
	const { format } = useCustomerNameFormat();
	const payload = useRecordField(customer, (record) => record.payload);

	if (!customer) {
		return (
			<Modal>
				<ModalContent side="right" size="xl">
					<ModalHeader>
						<ModalTitle>
							<Text>{t('common.no_customer_found')}</Text>
						</ModalTitle>
					</ModalHeader>
				</ModalContent>
			</Modal>
		);
	}

	return (
		<Modal>
			<ModalContent side="right" size="xl">
				<ModalHeader>
					<ModalTitle>
						<Text>{t('common.edit_2', { name: format(payload ?? {}) })}</Text>
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
							<EditCustomerForm customer={customer} />
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
