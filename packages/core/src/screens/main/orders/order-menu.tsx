import * as React from 'react';

import { useRouter } from 'expo-router';

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@wcpos/components/dropdown-menu';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import type { EngineRecord } from '@wcpos/query';

import { useT } from '../../../contexts/translations';
import { useProAccess } from '../contexts/pro-access';
import { DeleteOrderDialog, useOrderActions } from './order-actions';

/**
 *
 */
export function OrderActionsMenu({
	order,
	trigger,
	onDeleted,
}: {
	order: EngineRecord<'orders'>;
	trigger: React.ReactElement;
	onDeleted?: () => void;
}) {
	const router = useRouter();
	const t = useT();
	const { readOnly } = useProAccess();
	const actions = useOrderActions(order, { onDeleted });
	const { orderID, canRefund, storageDegraded, reopening } = actions;
	// View and Edit open the one order surface, the route modal, on their tab.
	const open = (tab: 'view' | 'edit') =>
		router.push({ pathname: '/orders/edit/[orderId]', params: { orderId: order.uuid!, tab } });

	if (readOnly) {
		return null;
	}

	/**
	 *
	 */
	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onPress={() => open('view')}>
						<Icon name="show" />
						<Text>{t('common.view')}</Text>
					</DropdownMenuItem>
					<DropdownMenuItem onPress={() => open('edit')}>
						<Icon name="edit" />
						<Text>{t('common.edit')}</Text>
					</DropdownMenuItem>
					<DropdownMenuItem
						testID="order-reopen-menu-item"
						onPress={actions.reopen}
						disabled={storageDegraded || reopening}
					>
						<Icon name="cart" />
						<Text>{t('orders.re-open')}</Text>
					</DropdownMenuItem>
					{orderID && (
						<>
							<DropdownMenuItem
								onPress={() =>
									router.push({
										pathname: '/orders/receipt/[orderId]',
										params: { orderId: order.uuid! },
									})
								}
							>
								<Icon name="receipt" />
								<Text>{t('common.receipt')}</Text>
							</DropdownMenuItem>
							{canRefund && (
								<DropdownMenuItem
									testID="order-refund-menu-item"
									onPress={actions.refund}
									disabled={storageDegraded}
								>
									<Icon name="refund" />
									<Text>{t('orders.refund')}</Text>
								</DropdownMenuItem>
							)}
							<DropdownMenuItem testID="order-refresh-menu-item" onPress={actions.sync}>
								<Icon name="refresh" />
								<Text>{t('common.sync')}</Text>
							</DropdownMenuItem>
						</>
					)}
					<DropdownMenuSeparator />
					<DropdownMenuItem
						testID="order-delete-menu-item"
						variant="destructive"
						onPress={actions.requestDelete}
						disabled={storageDegraded}
					>
						<Icon name="delete" className="text-destructive" />
						<Text>{t('common.delete')}</Text>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<DeleteOrderDialog
				orderID={orderID}
				open={actions.deleteOpen}
				onOpenChange={actions.setDeleteOpen}
				onConfirm={actions.confirmDelete}
				disabled={storageDegraded}
			/>
		</>
	);
}
