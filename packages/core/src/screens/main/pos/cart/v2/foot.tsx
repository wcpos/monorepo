import * as React from 'react';
import { View } from 'react-native';

import { HStack } from '@wcpos/components/hstack';
import { IconButton } from '@wcpos/components/icon-button';

import { useT } from '../../../../../contexts/translations';
import { useCurrentOrder } from '../../contexts/current-order';
import { PayButton } from '../buttons/pay';
import { OrderSheet } from './order-sheet';

export function CartFoot() {
	const [open, setOpen] = React.useState(false);
	const { currentOrderRecord } = useCurrentOrder();
	const t = useT();
	return (
		<>
			<HStack className="gap-2 p-2">
				<IconButton
					name="ellipsisVertical"
					testID="order-meta-button"
					accessibilityLabel={t('pos_cart.order_details')}
					onPress={() => setOpen(true)}
				/>
				<View className="flex-1">
					<PayButton />
				</View>
			</HStack>
			<OrderSheet open={open} onOpenChange={setOpen} order={currentOrderRecord} />
		</>
	);
}
