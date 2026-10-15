import * as React from 'react';
import { View } from 'react-native';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import {
	Dialog,
	DialogBody as ModalBody,
	DialogContent as ModalContent,
	DialogHeader as ModalHeader,
	DialogTitle as ModalTitle,
} from '@wcpos/components/v2/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';
import { Tree } from '@wcpos/components/tree';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { EditVariationForm } from './form';
import { useT } from '../../../../../contexts/translations';

interface Props {
	resource: ObservableResource<EngineRecord<'variations'> | null>;
	parentID?: string;
}

export function EditVariationModal({ resource }: Props) {
	const variation = useObservableSuspense(resource);
	const t = useT();
	const [value, setValue] = React.useState('form');
	const name = useRecordField(variation, (record) => record.payload.name);
	const payload = useRecordField(variation, (record) => record.payload);

	if (!variation) {
		return (
			<Dialog route>
				<ModalContent side="right" size="lg">
					<ModalHeader>
						<ModalTitle>
							<Text>{t('common.no_variation_found')}</Text>
						</ModalTitle>
					</ModalHeader>
				</ModalContent>
			</Dialog>
		);
	}

	return (
		<Dialog route>
			<ModalContent side="right" size="lg">
				<ModalHeader>
					<ModalTitle>
						<Text decodeHtml>{t('common.edit_2', { name })}</Text>
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
							<EditVariationForm variation={variation} />
						</TabsContent>
						<TabsContent value="json" className="min-h-0 flex-1">
							<ModalBody>
								<Tree value={payload} />
							</ModalBody>
						</TabsContent>
					</Tabs>
				</View>
			</ModalContent>
		</Dialog>
	);
}
