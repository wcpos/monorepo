import * as React from 'react';

import { useRouter } from 'expo-router';
import { useObservableSuspense } from 'observable-hooks';

import type { EngineRecord } from '@wcpos/query';
import { useEngineRecord } from '@wcpos/query/record-readers';

import { settleHeadlessPrint, useHeadlessPrints } from '../checkout-mode';
import { useReceiptDocument } from '../../../receipt/use-receipt-document';
import { useT } from '../../../../../contexts/translations';

/**
 * The receipt prints with nothing on screen: one invisible auto-print per queued sale, kept
 * mounted until its print settles, so leaving checkout never cuts a print short.
 */
export function HeadlessAutoPrintHost() {
	const queued = useHeadlessPrints();
	return (
		<>
			{[...queued].map((uuid) => (
				<React.Suspense key={uuid} fallback={null}>
					<HeadlessAutoPrint orderUuid={uuid} />
				</React.Suspense>
			))}
		</>
	);
}

function HeadlessAutoPrint({ orderUuid }: { orderUuid: string }) {
	const resource = useEngineRecord('orders', orderUuid);
	const order = useObservableSuspense(resource);
	// A sale that is gone has nothing to print.
	React.useEffect(() => {
		if (!order) settleHeadlessPrint(orderUuid);
	}, [order, orderUuid]);
	if (!order) return null;
	return <HeadlessAutoPrintDocument order={order} />;
}

function HeadlessAutoPrintDocument({ order }: { order: EngineRecord<'orders'> }) {
	const router = useRouter();
	const t = useT();
	const failureToastAction = React.useMemo(
		() => ({
			label: t('receipt.reprint'),
			onClick: () =>
				router.push({
					pathname: '/(app)/(drawer)/(pos)/(modals)/cart/receipt/[orderId]',
					params: { orderId: order.uuid },
				}),
		}),
		[t, router, order.uuid]
	);
	const { autoPrintSettled } = useReceiptDocument({
		order,
		autoPrintAllowed: true,
		headless: true,
		failureToastAction,
	});
	React.useEffect(() => {
		if (autoPrintSettled) settleHeadlessPrint(order.uuid);
	}, [autoPrintSettled, order.uuid]);
	return null;
}
