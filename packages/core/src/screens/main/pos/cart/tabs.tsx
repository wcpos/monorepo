import * as React from 'react';

import { Icon } from '@wcpos/components/icon';
import { ScrollableTabsList, Tabs, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';

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
			value={currentOrder.isNew ? 'new' : currentOrder.uuid}
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
				<Tooltip>
					<TooltipTrigger asChild>
						<TabsTrigger value="new">
							<Icon name="plus" />
						</TabsTrigger>
					</TooltipTrigger>
					<TooltipContent>
						<Text>{t('Open new order', { _tags: 'core' })}</Text>
					</TooltipContent>
				</Tooltip>
			</ScrollableTabsList>
		</Tabs>
	);
};
