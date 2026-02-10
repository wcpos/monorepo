import * as React from 'react';

import { Icon } from '@wcpos/components/icon';
import { ScrollableTabsList, Tabs, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';

import { CartTabTitle } from './tab-title';
import { useT } from '../../../../contexts/translations';
import { useCurrentOrder } from '../contexts/current-order';

/**
 *
 */
export function OpenOrderTabs() {
	const { currentOrder, openOrders, setCurrentOrderID } = useCurrentOrder();
	const t = useT();

	/**
	 *
	 */
	const handleTabPress = React.useCallback(
		(orderId: string) => {
			if (orderId === 'new') {
				setCurrentOrderID('');
			} else {
				setCurrentOrderID(orderId);
			}
		},
		[setCurrentOrderID]
	);

	/**
	 *
	 */
	return (
		<Tabs
			value={
				(currentOrder as unknown as { isNew: boolean }).isNew ? 'new' : (currentOrder.uuid ?? '')
			}
			onValueChange={handleTabPress}
			orientation="horizontal"
			className=""
		>
			<ScrollableTabsList className="bg-transparent p-0">
				{openOrders.map(({ id, document }) => (
					<TabsTrigger key={id} value={id}>
						<CartTabTitle order={document} />
					</TabsTrigger>
				))}
				<TabsTrigger value="new">
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
