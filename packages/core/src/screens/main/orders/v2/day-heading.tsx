import * as React from 'react';
import { View } from 'react-native';

import { format } from 'date-fns';

import { Text } from '@wcpos/components/text';
import type { EngineRecord } from '@wcpos/query';

import { convertUTCStringToLocalDate } from '../../../../hooks/use-local-date';
import { zoneOptions } from '../../../../hooks/use-store-day';

export type OrderHit = { id: string; record: EngineRecord<'orders'> };
export type DayItem = { id: string; type: 'day'; day: string; label: string };
export type OrderListItem = OrderHit | DayItem;
export const isDay = (item: OrderListItem): item is DayItem =>
	'type' in item && item.type === 'day';

export function groupOrders(
	hits: OrderHit[],
	sortField: string,
	timezone: string,
	heading: (iso: string) => string
): OrderListItem[] {
	if (sortField !== 'date_created_gmt') return hits;
	const items: OrderListItem[] = [];
	let previous: string | undefined;
	for (const hit of hits) {
		const iso = hit.record.payload.date_created_gmt;
		const day = iso
			? format(convertUTCStringToLocalDate(iso), 'yyyy-MM-dd', zoneOptions(timezone))
			: undefined;
		if (day && day !== previous)
			items.push({ id: `day-${day}`, type: 'day', day, label: heading(day) });
		items.push(hit);
		previous = day;
	}
	return items;
}

export function DayHeading({ day, label }: DayItem) {
	return (
		<View
			testID={`orders-day-heading-${day}`}
			className="min-h-row bg-background border-border justify-center border-b px-3"
		>
			<Text className="text-muted-foreground text-xs tracking-wide uppercase">{label}</Text>
		</View>
	);
}
