import * as React from 'react';

import { useObservableSuspense, ObservableResource } from 'observable-hooks';
import { isRxDocument } from 'rxdb';

import {
	ModalContent,
	ModalTitle,
	ModalBody,
	Modal,
	ModalHeader,
} from '@wcpos/components/src/modal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wcpos/components/src/tabs';
import { Text } from '@wcpos/components/src/text';
import { Tree } from '@wcpos/components/src/tree';

import { EditVariationForm } from './form';
import { useT } from '../../../../contexts/translations';
import useModalRefreshFix from '../../../../hooks/use-modal-refresh-fix';

interface Props {
	resource: ObservableResource<import('@wcpos/database').ProductVariationDocument>;
	parentID: string;
}

export const EditVariation = ({ resource }: Props) => {
	const variation = useObservableSuspense(resource);
	const t = useT();
	const [value, setValue] = React.useState('form');
	useModalRefreshFix();

	if (!isRxDocument(variation)) {
		return (
			<Modal>
				<ModalContent size="lg">
					<ModalHeader>
						<ModalTitle>
							<Text>{t('No variation found', { _tags: 'core' })}</Text>
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
						<Text>{t('Edit {name}', { name: variation.name, _tags: 'core' })}</Text>
					</ModalTitle>
				</ModalHeader>
				<ModalBody>
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
