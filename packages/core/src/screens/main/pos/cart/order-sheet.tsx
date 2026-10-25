import * as React from 'react';

import { useRouter } from 'expo-router';

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
import { useSyncOrder } from '../../hooks/use-sync-order';
import { useCurrentOrder } from '../contexts/current-order';
import { useVoidOrder } from '../hooks/use-void-order';

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
	// The form's pending autosave, awaited before Sync order pushes (a debounced note write
	// still in flight would otherwise be pushed as the value before it).
	const flushRef = React.useRef<(() => Promise<boolean>) | null>(null);
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent side={side} size="lg" portalHost="pos" testID="order-meta-dialog">
				<DialogHeader>
					<DialogTitle>{t('pos_cart.order_details')}</DialogTitle>
				</DialogHeader>
				<EditOrderMeta order={order} flushRef={flushRef} />
				<OrderSheetFooter order={order} flushRef={flushRef} onOpenChange={onOpenChange} />
			</DialogContent>
		</Dialog>
	);
}

function OrderSheetFooter({
	order,
	flushRef,
	onOpenChange,
}: {
	order: CurrentOrderRecord;
	flushRef: React.RefObject<(() => Promise<boolean>) | null>;
	onOpenChange: (open: boolean) => void;
}) {
	const t = useT();
	const router = useRouter();
	const { currentOrderRecord } = useCurrentOrder();
	const { sync, loading, disabled } = useSyncOrder(
		currentOrderRecord,
		() => flushRef.current?.() ?? Promise.resolve(true)
	);
	/** The cart column registers the void surface; this hook registers nothing (roadmap#428, PR 1b). */
	const { voidOrder, storageDegraded } = useVoidOrder({ onBeforeVoid: () => onOpenChange(false) });
	return (
		<DialogFooter
			destructive={{
				label: t('pos_cart.void'),
				testID: 'void-button',
				onPress: () => void voidOrder(),
				disabled: storageDegraded,
			}}
			secondary={{
				label: t('common.print'),
				icon: 'print',
				testID: 'order-print-button',
				onPress: () => {
					onOpenChange(false);
					router.push({
						pathname: '/(app)/(drawer)/(pos)/(modals)/cart/receipt/[orderId]',
						params: { orderId: order.uuid },
					});
				},
			}}
			intent={{
				label: t('pos_cart.sync_order'),
				testID: 'save-to-server-button',
				onPress: () => void sync(),
				loading,
				disabled,
			}}
		/>
	);
}
