import * as React from 'react';
import { View } from 'react-native';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import { FormatAddress } from '@wcpos/components/format';
import { Text } from '@wcpos/components/text';
import type { EngineRecord } from '@wcpos/query';

import { Section } from './_section';
import { useT } from '../../../../../contexts/translations';
import { TAX_ID_LABEL_KEYS, type TaxId, type TaxIdType } from '../../../../../lib/tax-id';
import { useCustomerNameFormat } from '../../../hooks/use-customer-name-format';
import { CustomerAvatar } from '../../../components/user-avatar/customer-avatar';

type OrderPayload = EngineRecord<'orders'>['payload'];
type Address = NonNullable<OrderPayload['billing']> | NonNullable<OrderPayload['shipping']>;

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
 * The tax IDs are the snapshotted `order.tax_ids` (not the live customer record), since the order owns its own copy from
 * sale-time.
 */
function orderTaxIds(order: OrderPayload) {
	const rawTaxIds = (order as { tax_ids?: unknown }).tax_ids;
	return Array.isArray(rawTaxIds) ? (rawTaxIds as TaxId[]) : [];
}

const LABEL = 'text-muted-foreground mb-1 text-xs tracking-wide uppercase';

/**
 * The customer, last as on a receipt: avatar and name, the customer's note right under it,
 * then the addresses and tax ids folded behind one disclosure, closed by default.
 */
export function CustomerSection({ order, last }: { order: OrderPayload; last?: boolean }) {
	const t = useT();
	const { format: formatCustomerName } = useCustomerNameFormat();
	const name = formatCustomerName({
		billing: order.billing,
		shipping: order.shipping,
		id: order.customer_id,
	});
	const billing = order.billing;
	const shipping = order.shipping;
	const same = addressKey(billing) === addressKey(shipping);
	const taxIds = orderTaxIds(order);
	const folded = hasAddress(billing) || hasAddress(shipping) || taxIds.length > 0;

	return (
		<Section title={t('common.customer')} last={last}>
			<View className="flex-row items-center gap-2">
				<CustomerAvatar
					customer={{ billing: order.billing, shipping: order.shipping, id: order.customer_id }}
					size="md"
				/>
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
			{order.customer_note ? (
				<View className="border-l-primary bg-primary/5 border-border mt-3 rounded-r-md border border-l-4 px-3 py-2.5">
					<Text className="text-foreground text-xs font-semibold">{t('common.customer_note')}</Text>
					<Text className="text-foreground/80 mt-0.5 text-xs">{order.customer_note}</Text>
				</View>
			) : null}
			{folded ? (
				<Collapsible className="mt-3">
					<CollapsibleTrigger testID="order-modal-addresses-trigger">
						<Text className="text-foreground text-sm font-medium">{t('common.addresses')}</Text>
					</CollapsibleTrigger>
					<CollapsibleContent>
						<View className="gap-3 pt-1">
							{hasAddress(billing) ? (
								<View>
									<Text className={LABEL}>{t('common.billing_address')}</Text>
									<FormatAddress address={billing as Record<string, string>} showName />
								</View>
							) : null}
							{!same && hasAddress(shipping) ? (
								<View>
									<Text className={LABEL}>{t('common.shipping_address')}</Text>
									<FormatAddress address={shipping as Record<string, string>} showName />
								</View>
							) : null}
							{taxIds.length > 0 ? (
								<View className="gap-1">
									<Text className={LABEL}>{t('tax_id.section_label', { _: 'Tax IDs' })}</Text>
									{taxIds.map((entry, index) => {
										const labelKey = TAX_ID_LABEL_KEYS[entry.type as TaxIdType];
										return (
											<View
												key={`${entry.type}-${entry.value}-${index}`}
												className="flex-row gap-2"
											>
												<Text className="text-muted-foreground text-xs">
													{t(labelKey ?? 'tax_id.label.other', { _: entry.type })}
												</Text>
												<Text className="text-foreground text-xs font-medium">{entry.value}</Text>
											</View>
										);
									})}
								</View>
							) : null}
						</View>
					</CollapsibleContent>
				</Collapsible>
			) : null}
		</Section>
	);
}
