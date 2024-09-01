import * as React from 'react';

import { Icon } from '@wcpos/components/src/icon';
import { Tabs, ScrollableTabsList, TabsTrigger } from '@wcpos/components/src/tabs';
import { Text } from '@wcpos/components/src/text';
import { Tooltip, TooltipTrigger, TooltipContent } from '@wcpos/components/src/tooltip';

import { CartTabTitle } from './tab-title';
import { useT } from '../../../../contexts/translations';
import { useCurrentOrder } from '../contexts/current-order';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
export const OpenOrderTabs = () => {
	const { currentOrder, openOrders, setCurrentOrderID } = useCurrentOrder();
	const t = useT();

	/**
	 *
	 */
	const handleTabPress = React.useCallback(
		(orderID: string) => {
			if (orderID === 'new') {
				setCurrentOrderID('');
			} else {
				setCurrentOrderID(orderID);
			}
		},
		[setCurrentOrderID]
	);

	/**
	 *
	 */
	return (
		<Tabs
			value={currentOrder.isNew ? 'new' : currentOrder.uuid}
			onValueChange={handleTabPress}
			orientation="horizontal"
		>
			<ScrollableTabsList className="p-0">
				{openOrders.map(({ id, document }) => (
					<TabsTrigger
						key={id}
						value={id}
						// variant={order.uuid === currentOrder.uuid ? 'default' : 'secondary'}
						// onPress={() => {
						// 	setCurrentOrderID(order.uuid);
						// }}
						// disabled={order.uuid === currentOrder.uuid}
					>
						<CartTabTitle order={document} />
					</TabsTrigger>
				))}
				<TabsTrigger
					value="new"
					asChild
					// variant={currentOrder.isNew ? 'default' : 'secondary'}
				>
					<Tooltip>
						<TooltipTrigger>
							<Icon name="plus" />
						</TooltipTrigger>
						<TooltipContent>
							<Text>{t('Open new order', { _tags: 'core' })}</Text>
						</TooltipContent>
					</Tooltip>
				</TabsTrigger>
			</ScrollableTabsList>
		</Tabs>
	);
};
