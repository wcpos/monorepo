import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { ScrollableTabsList, Tabs, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';

import { useEngineRecord } from '../../hooks/use-engine-document';
import { selectReceipt, useCheckoutMode } from '../checkout/checkout-mode';
import { TabChip } from './tab-chip';
import { CartTabTitle } from './tab-title';
import { useT } from '../../../../contexts/translations';
import { useCurrentOrder } from '../contexts/current-order';

/**
 *
 */
export function OpenOrderTabs() {
	const { currentOrderRecord, openOrders, setCurrentOrderID } = useCurrentOrder();

	const t = useT();
	const { receiptOrders, selectedReceiptOrder } = useCheckoutMode();
	const extraReceiptIds = [...receiptOrders].filter(
		(uuid) => !openOrders.some((order) => order.id === uuid)
	);

	/**
	 *
	 */
	const handleTabPress = React.useCallback(
		(orderId: string) => {
			if (receiptOrders.has(orderId)) {
				selectReceipt(orderId);
				return;
			}
			selectReceipt(null);
			if (orderId === 'new') {
				setCurrentOrderID('');
			} else {
				setCurrentOrderID(orderId);
			}
		},
		[setCurrentOrderID, receiptOrders]
	);

	/**
	 *
	 */
	const activeValue =
		selectedReceiptOrder ??
		((currentOrderRecord as { isNew?: boolean }).isNew ? 'new' : currentOrderRecord.uuid);

	return (
		<Tabs value={activeValue} onValueChange={handleTabPress} orientation="horizontal" className="">
			<ScrollableTabsList className="bg-transparent p-0">
				{openOrders.map(({ id, record }) => (
					<TabsTrigger key={id} value={id} testID={`open-order-tab-${id}`}>
						<HStack className="items-center gap-2">
							<CartTabTitle order={record} />
							<TabChip order={record} active={id === activeValue} />
						</HStack>
					</TabsTrigger>
				))}
				{extraReceiptIds.map((uuid) => (
					<React.Suspense key={uuid} fallback={null}>
						<ReceiptTab uuid={uuid} active={uuid === activeValue} />
					</React.Suspense>
				))}
				<TabsTrigger value="new" testID="new-order-tab">
					<Tooltip>
						<TooltipTrigger>
							<Icon name="plus" />
						</TooltipTrigger>
						<TooltipContent>
							<Text>{t('pos_cart.open_new_order')}</Text>
						</TooltipContent>
					</Tooltip>
				</TabsTrigger>
			</ScrollableTabsList>
		</Tabs>
	);
}

function ReceiptTab({ uuid, active }: { uuid: string; active: boolean }) {
	const resource = useEngineRecord('orders', uuid);
	const record = useObservableSuspense(resource);
	if (!record) return null;
	return (
		<TabsTrigger value={uuid} testID={`open-order-tab-${uuid}`}>
			<HStack className="items-center gap-2">
				<CartTabTitle order={record} />
				<TabChip order={record} active={active} />
			</HStack>
		</TabsTrigger>
	);
}
