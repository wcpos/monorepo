import * as React from 'react';

import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/v2/dialog';

import { useT } from '../../../../../contexts/translations';
import { usePanelSide } from '../../contexts/overlay-side/v2';
import { EditOrderMeta } from '../buttons/edit-order-meta';
import { SaveButton } from '../buttons/save-order';
import { VoidButton } from '../buttons/void';

import type { CurrentOrderRecord } from '../../contexts/current-order';

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
	// The form's submit, applied by "Save order" before the push.
	const submitRef = React.useRef<(() => Promise<void>) | null>(null);
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent side={side} size="lg" portalHost="pos" testID="order-meta-dialog">
				<DialogHeader>
					<DialogTitle>{t('pos_cart.order_details')}</DialogTitle>
				</DialogHeader>
				<EditOrderMeta order={order} submitRef={submitRef} />
				<DialogFooter className="flex-row justify-between gap-2">
					<VoidButton onBeforeVoid={() => onOpenChange(false)} />
					<SaveButton
						label={t('pos_cart.save_order')}
						onBeforeSave={async () => {
							await submitRef.current?.();
						}}
					/>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
