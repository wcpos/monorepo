import * as React from 'react';

import { useObservableSuspense, ObservableResource } from 'observable-hooks';

import { ModalContent, ModalTitle, ModalContainer } from '@wcpos/components/src/modal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wcpos/components/src/tabs';
import { Text } from '@wcpos/components/src/text';
import { Tree } from '@wcpos/components/src/tree';

// import { EditOrderForm } from './form';
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

	return (
		<ModalContainer>
			<ModalTitle>{t('Edit {name}', { name: format(customer), _tags: 'core' })}</ModalTitle>
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
						<EditCustomerForm defaultValues={customer.toJSON()} />
					</TabsContent>
					<TabsContent value="json">
						<Tree value={customer.toJSON()} />
					</TabsContent>
				</Tabs>
			</ModalContent>
		</ModalContainer>
	);
};
