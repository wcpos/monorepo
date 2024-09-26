import * as React from 'react';

import { Button, ButtonText } from '@wcpos/components/src/button';
import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogBody,
} from '@wcpos/components/src/dialog';
import { Text } from '@wcpos/components/src/text';

import { EditOrderMeta } from './edit-order-meta';
import { useT } from '../../../../../contexts/translations';
import { useCurrentOrder } from '../../contexts/current-order';

/**
 *
 */
export const OrderMetaButton = () => {
	const { currentOrder } = useCurrentOrder();
	const t = useT();

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="outline">
					<ButtonText>{t('Order Meta', { _tags: 'core' })}</ButtonText>
				</Button>
			</DialogTrigger>
			<DialogContent size="lg">
				<DialogHeader>
					<DialogTitle>
						<Text>{t('Order Meta', { _tags: 'core' })}</Text>
					</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<EditOrderMeta order={currentOrder} />
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
};
