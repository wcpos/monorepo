import * as React from 'react';

import { Button } from '@wcpos/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@wcpos/components/dialog';

import { EditOrderMeta } from './edit-order-meta';
import { useT } from '../../../../../contexts/translations';
import { usePOSOverlaySide } from '../../contexts/overlay-side';

import type { CurrentOrderRecord } from '../../contexts/current-order';

export function OrderMetaButton({ onPress }: { onPress: () => void }) {
	const t = useT();
	return (
		<Button testID="order-meta-button" variant="outline" onPress={onPress}>
			{t('pos_cart.order_meta')}
		</Button>
	);
}

export function OrderMetaDialog({
	order,
	onOpenChange,
}: {
	order: CurrentOrderRecord | null;
	onOpenChange: (open: boolean) => void;
}) {
	const side = usePOSOverlaySide();
	const t = useT();
	return (
		<Dialog open={!!order} onOpenChange={onOpenChange}>
			<DialogContent side={side} testID="order-meta-dialog" size="lg" portalHost="pos">
				<DialogHeader>
					<DialogTitle>{t('pos_cart.order_meta')}</DialogTitle>
				</DialogHeader>
				{order && <EditOrderMeta order={order} />}
			</DialogContent>
		</Dialog>
	);
}
