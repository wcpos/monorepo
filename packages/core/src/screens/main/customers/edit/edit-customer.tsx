import * as React from 'react';
import { View } from 'react-native';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';
import { Tree } from '@wcpos/components/tree';
import { type EngineRecord, type ReadonlyEngineRecord, useRecordField } from '@wcpos/query';

import { EditCustomerForm } from './form';
import { useT } from '../../../../contexts/translations';
import { useCustomerNameFormat } from '../../hooks/use-customer-name-format';

interface Props {
	resource: ObservableResource<EngineRecord<'customers'> | null>;
}

export function EditCustomer({ resource }: Props) {
	const customer: ReadonlyEngineRecord<'customers'> | null = useObservableSuspense(resource);
	const t = useT();
	const [value, setValue] = React.useState('form');
	const { format } = useCustomerNameFormat();
	const payload = useRecordField(customer, (record) => record.payload);

	if (!customer) {
		return (
			<Dialog route>
				<DialogContent side="right" size="xl">
					<DialogHeader>
						<DialogTitle>
							<Text>{t('common.no_customer_found')}</Text>
						</DialogTitle>
					</DialogHeader>
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Dialog route>
			<DialogContent side="right" size="xl">
				<DialogHeader>
					<DialogTitle>
						<Text>{t('common.edit_2', { name: format(payload ?? {}) })}</Text>
					</DialogTitle>
				</DialogHeader>
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
							<DialogBody>
								<Tree value={payload} />
							</DialogBody>
						</TabsContent>
					</Tabs>
				</View>
			</DialogContent>
		</Dialog>
	);
}
