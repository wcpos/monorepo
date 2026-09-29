import * as React from 'react';
import { View } from 'react-native';

import { Button } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { IconButton } from '@wcpos/components/icon-button';

import { useRegisterSession } from '../../../../../services/register-session/use-register-session';
import { NoteRow } from './note-row';
import { useT } from '../../../../../contexts/translations';
import { useCurrentOrder } from '../../contexts/current-order';
import { PayButton } from '../buttons/pay';
import { OrderSheet } from './order-sheet';

export function CartFoot({
	onOpenRegister,
	onCloseRegister,
}: {
	onOpenRegister: () => void;
	onCloseRegister: () => void;
}) {
	const { sessionsOn, session, overdue } = useRegisterSession();
	const [open, setOpen] = React.useState(false);
	const { currentOrderRecord } = useCurrentOrder();
	const t = useT();
	return (
		<>
			<NoteRow order={currentOrderRecord} onPress={() => setOpen(true)} />
			<HStack className="gap-2 p-2">
				<IconButton
					name="ellipsisVertical"
					testID="order-meta-button"
					accessibilityLabel={t('pos_cart.order_details')}
					onPress={() => setOpen(true)}
				/>
				<View className="flex-1">
					{sessionsOn && !session ? (
						<Button
							testID="checkout-open-register"
							className="min-h-14 flex-1"
							onPress={onOpenRegister}
						>
							{t('register.open_register')}
						</Button>
					) : overdue && !currentOrderRecord.payload.line_items?.length ? (
						<Button
							testID="checkout-close-register"
							className="min-h-14 flex-1"
							onPress={onCloseRegister}
						>
							{t('register.close_register')}
						</Button>
					) : (
						<PayButton />
					)}
				</View>
			</HStack>
			<OrderSheet open={open} onOpenChange={setOpen} order={currentOrderRecord} />
		</>
	);
}
