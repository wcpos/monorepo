import * as React from 'react';
import { View } from 'react-native';

import { Badge } from '@wcpos/components/badge';
import { Chip } from '@wcpos/components/chip';
import { Combobox, ComboboxContent, ComboboxTrigger } from '@wcpos/components/combobox';
import type { Option } from '@wcpos/components/combobox/types';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { useRecordField } from '@wcpos/query';

import { AddCartItemsMenu } from './add-cart-items-menu';
import { Customer } from './customer';
import { UISettingsForm } from './ui-settings-form';
import { useT } from '../../../../contexts/translations';
import { CustomerSearch } from '../../components/customer-select';
import { UISettingsDialog } from '../../components/ui-settings';
import { usePanelSide } from '../contexts/overlay-side';
import { useAddCustomer } from '../hooks/use-add-customer';
import { useCustomerNameFormat } from '../../hooks/use-customer-name-format';
import { useCurrentOrder } from '../contexts/current-order';

import type { CustomerData } from '../../hooks/use-customer-name-format/helpers';

/**
 * The cart's head row. `stilled` is checkout and receipt: the same row at the same height,
 * the customer in the same slot as static text, the add and settings controls gone and the
 * order number in their place. Static, so a Badge, not a disabled Chip (decision 10).
 */
export function CartHeader({ stilled = false }: { stilled?: boolean }) {
	return stilled ? <StilledCartHeader /> : <LiveCartHeader />;
}

/** The badges are as tall as the live chip, so the row does not move. */
const STILLED_BADGE = 'h-ctl px-3';

function StilledCartHeader() {
	const t = useT();
	const { currentOrderRecord } = useCurrentOrder();
	const billing = useRecordField(currentOrderRecord, (order) => order.payload.billing);
	const shipping = useRecordField(currentOrderRecord, (order) => order.payload.shipping);
	const customerId = useRecordField(currentOrderRecord, (order) => order.payload.customer_id);
	const number = useRecordField(currentOrderRecord, (order) => order.payload.number);
	const { format } = useCustomerNameFormat();
	return (
		<HStack testID="checkout-ledger-header" className="border-border min-h-ctl border-b px-2 py-2">
			<HStack className="h-ctl min-w-0 flex-1">
				<Text className="text-muted-foreground" numberOfLines={1}>
					{t('common.customer')}
				</Text>
				<View className="min-w-0 shrink">
					<Badge
						testID="checkout-ledger-customer"
						variant="muted"
						size="lg"
						// The customer gives way to the number: a long name truncates in its slot.
						className={`${STILLED_BADGE} max-w-full shrink`}
					>
						{format({ billing, shipping, id: customerId })}
					</Badge>
				</View>
			</HStack>
			{/* An order with no number yet (saving, queued offline or refused): a placeholder,
			    never an empty "#". */}
			{!number ? (
				<View
					className="bg-muted h-ctl w-16 self-center rounded-full"
					testID="checkout-ledger-number-skeleton"
				/>
			) : (
				<Badge testID="checkout-ledger-number" variant="muted" size="lg" className={STILLED_BADGE}>
					{`#${number ?? ''}`}
				</Badge>
			)}
		</HStack>
	);
}

function LiveCartHeader() {
	const { addCustomer } = useAddCustomer();
	const side = usePanelSide('cart');
	const [showCustomerSelect, setShowCustomerSelect] = React.useState(false);
	const t = useT();
	const triggerRef = React.useRef<{ open: () => void } | null>(null);
	const handleSelectCustomer = React.useCallback(
		async (option: Option<CustomerData> | undefined) => {
			if (option?.item) {
				await addCustomer(option.item);
			}
			setShowCustomerSelect(false);
		},
		[addCustomer]
	);
	/**
	 * Open the combobox after React renders it (next frame)
	 */
	const handleShowCustomerSelect = React.useCallback((show: boolean) => {
		setShowCustomerSelect(show);
		if (show) {
			requestAnimationFrame(() => {
				triggerRef.current?.open();
			});
		}
	}, []);
	/**
	 * HACK: If the combobox closes without selecting a customer, we need to go back to the customer pill.
	 * But! If we go back to the customer pill on select, the previous customer will flash before the new one is set.
	 * So we delay the close handler by 10ms to allow the new customer to be set before hiding the combobox.
	 */
	const delayedCloseHandler = React.useCallback((opened: boolean) => {
		if (!opened) {
			setTimeout(() => {
				setShowCustomerSelect(false);
			}, 10);
		}
	}, []);
	return (
		<HStack className="border-border min-h-ctl border-b px-2 py-2">
			{/* `min-w-0` and the shrinking wrapper: a long customer name truncates instead of
			    pushing the add and settings controls off the row. */}
			<HStack className="h-ctl min-w-0 flex-1">
				<Text className="text-muted-foreground" numberOfLines={1}>
					{t('common.customer')}
				</Text>
				<View className="min-w-0 shrink">
					<ErrorBoundary>
						{showCustomerSelect ? (
							<Combobox<CustomerData>
								onValueChange={handleSelectCustomer}
								onOpenChange={delayedCloseHandler}
							>
								{/* @ts-expect-error: ComboboxTrigger ref type is more specific than our ref with open() method */}
								<ComboboxTrigger ref={triggerRef} asChild>
									<Chip
										testID="cart-customer-select"
										icon="user"
										label={t('common.select_customer')}
									/>
								</ComboboxTrigger>
								<ComboboxContent>
									<CustomerSearch withGuest />
								</ComboboxContent>
							</Combobox>
						) : (
							<Customer onShowCustomerSelect={handleShowCustomerSelect} />
						)}
					</ErrorBoundary>
				</View>
			</HStack>
			<AddCartItemsMenu />
			<UISettingsDialog
				side={side}
				portalHost="pos"
				title={t('pos_cart.cart_settings')}
				triggerTestID="cart-settings-button"
			>
				<UISettingsForm />
			</UISettingsDialog>
		</HStack>
	);
}
