import * as React from 'react';

import { useRouter } from 'expo-router';

import { Button } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';

import { useT } from '../../../../contexts/translations';
import { usePanelSide } from '../contexts/overlay-side';
import { EditOrderMeta } from './buttons/edit-order-meta';
import { SaveButton } from './buttons/save-order';
import { VoidButton } from './buttons/void';

import type { CurrentOrderRecord } from '../contexts/current-order';

export function OrderSheet({
	open,
	onOpenChange,
	order,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	order: CurrentOrderRecord;
}) {
	const side = usePanelSide('cart');
	const t = useT();
	const router = useRouter();
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent side={side} size="lg" portalHost="pos" testID="order-meta-dialog">
				<DialogHeader>
					<DialogTitle>{t('pos_cart.order_details')}</DialogTitle>
				</DialogHeader>
				<EditOrderMeta order={order} />
				<DialogFooter className="flex-row justify-between gap-2">
					<VoidButton onBeforeVoid={() => onOpenChange(false)} />
					<HStack className="gap-2">
						<Button
							variant="outline"
							leftIcon="print"
							testID="order-print-button"
							onPress={() => {
								onOpenChange(false);
								router.push({
									pathname: '/(app)/(drawer)/(pos)/(modals)/cart/receipt/[orderId]',
									params: { orderId: order.uuid },
								});
							}}
						>
							{t('common.print')}
						</Button>
						<SaveButton />
					</HStack>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
