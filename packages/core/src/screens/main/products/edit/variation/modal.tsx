import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { isRxDocument } from 'rxdb';

import { Modal, ModalBody, ModalContent, ModalHeader, ModalTitle } from '@wcpos/components/modal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';
import { Tree } from '@wcpos/components/tree';

import { EditVariationForm } from './form';
import { useT } from '../../../../../contexts/translations';

interface Props {
	resource: ObservableResource<import('@wcpos/database').ProductVariationDocument>;
	parentID: string;
}

export const EditVariationModal = ({ resource }: Props) => {
	const variation = useObservableSuspense(resource);
	const t = useT();
	const [value, setValue] = React.useState('form');

	if (!isRxDocument(variation)) {
		return (
			<Modal>
				<ModalContent size="lg">
					<ModalHeader>
						<ModalTitle>
							<Text>{t('No variation found')}</Text>
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
						<Text>{t('Edit {name}', { name: variation.name })}</Text>
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
							<EditVariationForm variation={variation} />
						</TabsContent>
						<TabsContent value="json">
							<Tree value={variation.toJSON()} />
						</TabsContent>
					</Tabs>
				</ModalBody>
			</ModalContent>
		</Modal>
	);
};
