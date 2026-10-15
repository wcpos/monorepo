import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@wcpos/components/v2/dialog';
import { Text } from '@wcpos/components/text';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { RefundOrderForm } from './form';
import { useT } from '../../../../contexts/translations';

interface Props {
	resource: ObservableResource<EngineRecord<'orders'> | null>;
}

export function RefundOrderModal({ resource }: Props) {
	const order = useObservableSuspense(resource);
	const t = useT();
	const orderId = useRecordField(order, (record) => record.payload.id);

	if (!order) {
		return (
			<Dialog route>
				<DialogContent side="right" size="xl">
					<DialogHeader>
						<DialogTitle>
							<Text>{t('common.no_order_found')}</Text>
						</DialogTitle>
					</DialogHeader>
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Dialog route>
			<DialogContent side="right" size="xl">
				<DialogHeader>
					<DialogTitle>
						<Text>{t('orders.refund_order', { number: orderId || '' })}</Text>
					</DialogTitle>
				</DialogHeader>
				<RefundOrderForm order={order} />
			</DialogContent>
		</Dialog>
	);
}
