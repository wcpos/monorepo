import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from '@wcpos/tailwind/src/dialog';
import { Textarea } from '@wcpos/tailwind/src/textarea';

import { useT } from '../../../../../contexts/translations';
import { useLocalMutation } from '../../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../../contexts/current-order';

/**
 *
 */
export const OrderMetaButton = () => {
	const { currentOrder } = useCurrentOrder();
	const t = useT();
	const [open, setOpen] = React.useState(false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline">
					<ButtonText>{t('Order Meta', { _tags: 'core' })}</ButtonText>
				</Button>
			</DialogTrigger>
			<DialogContent>Test</DialogContent>
		</Dialog>
	);
};
