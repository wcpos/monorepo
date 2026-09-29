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

export function CartFoot({
	onOpenRegister,
	onCloseRegister,
	onOpenSheet,
}: {
	onOpenRegister: () => void;
	onCloseRegister: () => void;
	/**
	 * The order sheet is the cart root's, pinned to the order it opened for: a status or
	 * cashier change sent from it moves that order out of the open list, this foot
	 * unmounts with the branch, and the sheet must stay to show the result.
	 */
	onOpenSheet: () => void;
}) {
	const { sessionsOn, session, overdue } = useRegisterSession();
	const { currentOrderRecord } = useCurrentOrder();
	const t = useT();
	return (
		<>
			<NoteRow order={currentOrderRecord} onPress={onOpenSheet} />
			<HStack className="gap-2 p-2">
				<IconButton
					name="ellipsisVertical"
					testID="order-meta-button"
					accessibilityLabel={t('pos_cart.order_details')}
					onPress={onOpenSheet}
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
		</>
	);
}
