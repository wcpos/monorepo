import * as React from 'react';
import { View } from 'react-native';

import { Avatar, getInitials } from '@wcpos/components/avatar';
import { Text } from '@wcpos/components/text';

import { RailSection, Section } from './_section';

type OrderDocument = import('@wcpos/database').OrderDocument;
type Address = NonNullable<OrderDocument['billing']> | NonNullable<OrderDocument['shipping']>;

function addressLines(address?: Address) {
	if (!address) return [];
	return [
		[address.first_name, address.last_name].filter(Boolean).join(' '),
		address.company,
		address.address_1,
		address.address_2,
		[address.city, address.state, address.postcode].filter(Boolean).join(', '),
		address.country,
	].filter(Boolean) as string[];
}

function customerName(order: OrderDocument) {
	const name = [order.billing?.first_name, order.billing?.last_name].filter(Boolean).join(' ');
	return name || order.billing?.company || order.billing?.email || 'Guest';
}

function sameAddress(order: OrderDocument) {
	return addressLines(order.billing).join('\n') === addressLines(order.shipping).join('\n');
}

/**
 * Compact customer card for the right rail.
 */
export function CustomerRail({ order, last }: { order: OrderDocument; last?: boolean }) {
	const name = customerName(order);
	const initials = getInitials(name);

	return (
		<RailSection title="Customer" last={last}>
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
	const same = sameAddress(order);
	const billing = addressLines(order.billing);
	const shipping = addressLines(order.shipping);

	if (!billing.length && !shipping.length) return null;

	return (
		<RailSection title="Addresses" last={last}>
			<View className="gap-3">
				{billing.length ? (
					<View>
						<Text className="text-muted-foreground mb-1 text-[10px] tracking-wide uppercase">
							Bill to
						</Text>
						{billing.map((line, index) => (
							<Text
								key={`billing-${index}`}
								className={
									index === billing.length - 1
										? 'text-muted-foreground text-xs'
										: 'text-foreground text-xs'
								}
							>
								{line}
							</Text>
						))}
					</View>
				) : null}
				{!same && shipping.length ? (
					<View>
						<Text className="text-muted-foreground mb-1 text-[10px] tracking-wide uppercase">
							Ship to
						</Text>
						{shipping.map((line, index) => (
							<Text
								key={`shipping-${index}`}
								className={
									index === shipping.length - 1
										? 'text-muted-foreground text-xs'
										: 'text-foreground text-xs'
								}
							>
								{line}
							</Text>
						))}
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
	if (!order.customer_note) return null;
	return (
		<Section>
			<View className="border-l-primary bg-primary/5 border-border rounded-r-md border border-l-4 px-3 py-2.5">
				<Text className="text-foreground text-xs font-semibold">Customer note</Text>
				<Text className="text-foreground/80 mt-0.5 text-xs">{order.customer_note}</Text>
			</View>
		</Section>
	);
}

/**
 * Backwards-compat: the existing modal still imports CustomerSection.
 * Kept for any callers that expect a single component; the new modal
 * composes CustomerRail / AddressesRail / CustomerNoteSection directly.
 */
export function CustomerSection({ order }: { order: OrderDocument }) {
	return (
		<View>
			<CustomerRail order={order} />
			<AddressesRail order={order} />
			<CustomerNoteSection order={order} />
		</View>
	);
}
