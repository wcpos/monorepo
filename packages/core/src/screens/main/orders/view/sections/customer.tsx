import * as React from 'react';
import { View } from 'react-native';

import { Avatar, getInitials } from '@wcpos/components/avatar';
import { FormatAddress } from '@wcpos/components/format';
import { Text } from '@wcpos/components/text';

import { RailSection, Section } from './_section';
import { useT } from '../../../../../contexts/translations';
import { useCustomerNameFormat } from '../../../hooks/use-customer-name-format';

type OrderDocument = import('@wcpos/database').OrderDocument;
type Address = NonNullable<OrderDocument['billing']> | NonNullable<OrderDocument['shipping']>;

function addressKey(address?: Address) {
	if (!address) return '';
	return [
		address.address_1,
		address.address_2,
		address.city,
		address.state,
		address.postcode,
		address.country,
	]
		.map((value) => value?.trim().toLowerCase())
		.filter(Boolean)
		.join('|');
}

function hasAddress(address?: Address) {
	if (!address) return false;
	return Boolean(
		address.first_name ||
		address.last_name ||
		address.company ||
		address.address_1 ||
		address.address_2 ||
		address.city ||
		address.postcode ||
		address.country
	);
}

/**
 * Compact customer card for the right rail.
 */
export function CustomerRail({ order, last }: { order: OrderDocument; last?: boolean }) {
	const t = useT();
	const { format: formatCustomerName } = useCustomerNameFormat();
	const name = formatCustomerName({
		billing: order.billing,
		shipping: order.shipping,
		id: order.customer_id,
	});
	const initials = getInitials(name);

	return (
		<RailSection title={t('common.customer')} last={last}>
			<View className="flex-row items-center gap-2">
				<Avatar size="md" fallback={initials} variant="default" />
				<View className="min-w-0 flex-1">
					<Text className="text-foreground text-sm font-medium" numberOfLines={1}>
						{name}
					</Text>
					{order.billing?.email ? (
						<Text className="text-muted-foreground text-xs" numberOfLines={1}>
							{order.billing.email}
						</Text>
					) : null}
				</View>
			</View>
			{order.billing?.phone ? (
				<Text className="text-muted-foreground mt-2 text-xs">{order.billing.phone}</Text>
			) : null}
		</RailSection>
	);
}

/**
 * Addresses block for the right rail.
 */
export function AddressesRail({ order, last }: { order: OrderDocument; last?: boolean }) {
	const t = useT();
	const billing = order.billing;
	const shipping = order.shipping;
	const same = addressKey(billing) === addressKey(shipping);

	if (!hasAddress(billing) && !hasAddress(shipping)) return null;

	return (
		<RailSection title={t('common.addresses', { defaultValue: 'Addresses' })} last={last}>
			<View className="gap-3">
				{hasAddress(billing) ? (
					<View>
						<Text className="text-muted-foreground mb-1 text-[10px] tracking-wide uppercase">
							{t('common.billing_address')}
						</Text>
						<FormatAddress address={billing as Record<string, string>} showName />
					</View>
				) : null}
				{!same && hasAddress(shipping) ? (
					<View>
						<Text className="text-muted-foreground mb-1 text-[10px] tracking-wide uppercase">
							{t('common.shipping_address')}
						</Text>
						<FormatAddress address={shipping as Record<string, string>} showName />
					</View>
				) : null}
			</View>
		</RailSection>
	);
}

/**
 * Customer note callout in the main column.
 */
export function CustomerNoteSection({ order }: { order: OrderDocument }) {
	const t = useT();
	if (!order.customer_note) return null;
	return (
		<Section>
			<View className="border-l-primary bg-primary/5 border-border rounded-r-md border border-l-4 px-3 py-2.5">
				<Text className="text-foreground text-xs font-semibold">{t('common.customer_note')}</Text>
				<Text className="text-foreground/80 mt-0.5 text-xs">{order.customer_note}</Text>
			</View>
		</Section>
	);
}
