import * as React from 'react';

import { Button } from '@wcpos/components/button';
import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogBody,
} from '@wcpos/components/dialog';

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
				<Button variant="outline">{t('Order Meta', { _tags: 'core' })}</Button>
			</DialogTrigger>
			<DialogContent size="lg" portalHost="pos">
				<DialogHeader>
					<DialogTitle>{t('Order Meta', { _tags: 'core' })}</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<EditOrderMeta order={currentOrder} />
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
};
