import * as React from 'react';
import { View } from 'react-native';

import { Icon } from '@wcpos/components/icon';
import { useIsPhone } from '@wcpos/components/lib/device';
import { ListRow } from '@wcpos/components/list-row';
import { Text } from '@wcpos/components/text';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { useStoreDayLabel } from '../../../hooks/use-store-day-label';
import { useCustomerNameFormat } from '../hooks/use-customer-name-format';
import { OrderStatusBadge } from './cells/status';
import { OrderTotal } from './cells/total';

export function OrderRow({
	record,
	onSelect,
}: {
	record: EngineRecord<'orders'>;
	onSelect: (uuid: string) => void;
}) {
	const order = useRecordField(record, ({ payload }) => payload);
	const { format } = useCustomerNameFormat();
	const { day, dateTime } = useStoreDayLabel();
	const phone = useIsPhone();
	return (
		<ListRow
			testID={`orders-row-${record.uuid}`}
			onPress={() => onSelect(record.uuid)}
			bodyClassName="gap-1"
			trailing={
				<>
					<View>
						<OrderTotal
							total={order.total}
							currencySymbol={order.currency_symbol as string}
							refunds={order.refunds}
						/>
					</View>
					<Icon name="chevronRight" className="text-muted-foreground" />
				</>
			}
		>
			<View className="flex-row items-center gap-1">
				<Text testID={`order-number-${order.number}`}>#{order.number}</Text>
				<Text className="min-w-0 shrink" numberOfLines={1}>
					· {format({ id: order.customer_id, billing: order.billing, shipping: order.shipping })}
				</Text>
				{order.customer_note ? <Icon name="note" size="sm" /> : null}
			</View>
			<View className="flex-row items-center gap-1">
				<OrderStatusBadge status={order.status} />
				<Text variant="key" className="min-w-0 shrink" numberOfLines={1}>
					{[
						order.date_created_gmt &&
							(phone ? day(order.date_created_gmt) : dateTime(order.date_created_gmt)),
						order.payment_method_title,
					]
						.filter(Boolean)
						.map((part) => ` · ${part}`)
						.join('')}
				</Text>
			</View>
		</ListRow>
	);
}
