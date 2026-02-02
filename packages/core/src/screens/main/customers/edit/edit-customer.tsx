import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { isRxDocument } from 'rxdb';

import { Modal, ModalBody, ModalContent, ModalHeader, ModalTitle } from '@wcpos/components/modal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';
import { Tree } from '@wcpos/components/tree';

import { EditCustomerForm } from './form';
import { useT } from '../../../../contexts/translations';
import useCustomerNameFormat from '../../hooks/use-customer-name-format';

interface Props {
	resource: ObservableResource<import('@wcpos/database').CustomerDocument>;
}

export const EditCustomer = ({ resource }: Props) => {
	const customer = useObservableSuspense(resource);
	const t = useT();
	const [value, setValue] = React.useState('form');
	const { format } = useCustomerNameFormat();

	if (!isRxDocument(customer)) {
		return (
			<Modal>
				<ModalContent size="lg">
					<ModalHeader>
						<ModalTitle>
							<Text>{t('No customer found')}</Text>
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
						<Text>{t('Edit {name}', { name: format(customer) })}</Text>
					</ModalTitle>
				</ModalHeader>
				<ModalBody>
					<Tabs value={value} onValueChange={setValue}>
						<TabsList className="w-full flex-row">
							<TabsTrigger value="form" className="flex-1">
								<Text>{t('Form')}</Text>
							</TabsTrigger>
							<TabsTrigger value="json" className="flex-1">
								<Text>{t('JSON')}</Text>
							</TabsTrigger>
						</TabsList>
						<TabsContent value="form">
							<EditCustomerForm customer={customer} />
						</TabsContent>
						<TabsContent value="json">
							<Tree value={customer.toJSON()} />
						</TabsContent>
					</Tabs>
				</ModalBody>
			</ModalContent>
		</Modal>
	);
};
