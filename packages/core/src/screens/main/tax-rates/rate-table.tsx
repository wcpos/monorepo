import * as React from 'react';
import { View } from 'react-native';

import { useIsPhone } from '@wcpos/components/lib/device';
import { ListRow } from '@wcpos/components/list-row';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@wcpos/components/table';
import { Text } from '@wcpos/components/text';

import { locationField, phoneLocation, phoneTags, rateTags } from './rate-rows';
import { useT } from '../../../contexts/translations';
import { usePercentFormat } from '../hooks/use-percent-format';

import type { TaxRateData } from '../contexts/tax-rates';

interface TaxRateTableProps {
	rates: TaxRateData[];
}

/**
 * Fixed widths sized by what each column holds (codes 56, lists 120, rate 72, priority 64), so
 * no head wraps; the name takes the rest. `flex-none` beats the primitives' `flex-1`.
 */
const COLUMNS = {
	country: 'w-14 flex-none',
	state: 'w-14 flex-none',
	postcode: 'w-30 flex-none',
	city: 'w-30 flex-none',
	rate: 'w-18 flex-none items-end',
	name: 'min-w-0 flex-1',
	priority: 'w-16 flex-none items-end',
} as const;

/**
 * One tax class's rates: WooCommerce's own columns in its order, so the two screens read side by
 * side, in the app's table grammar (flush on the panel's gutter: the panel is the card). On a
 * phone (`useIsPhone`, the app's one layout boundary) the rows are the management lists' phone
 * rows instead; only one of the two is ever rendered.
 */
export function TaxRateTable({ rates }: TaxRateTableProps) {
	const t = useT();
	const percent = usePercentFormat();
	const isPhone = useIsPhone();

	if (rates.length === 0) {
		return (
			<View className="items-center p-8">
				<Text className="text-muted-foreground text-center">{t('tax_rates.none_in_class')}</Text>
			</View>
		);
	}

	/**
	 * A location cell: the stored codes or patterns, or a muted "Any" for WooCommerce's `*`. A
	 * list (postcodes, cities) may wrap to a second line and no further: dozens of ZIPs must not
	 * make one row the height of the table.
	 */
	const location = (value: string | readonly string[] | null | undefined) => {
		const shown = locationField(value);
		return shown ? (
			<Text numberOfLines={Array.isArray(value) ? 2 : undefined}>{shown}</Text>
		) : (
			<Text className="text-muted-foreground">{t('tax_rates.any')}</Text>
		);
	};

	if (isPhone) {
		return (
			<View testID="tax-rates-list">
				{rates.map((rate) => {
					const tags = phoneTags(rate, t);
					return (
						<ListRow
							key={rate.id}
							testID={`tax-rate-row-${rate.id}`}
							className="px-0"
							trailing={
								<Text className="font-semibold tabular-nums">{percent(rate.rate ?? '0')}</Text>
							}
						>
							<Text decodeHtml numberOfLines={1}>
								{rate.name}
							</Text>
							<Text className="text-muted-foreground text-sm" numberOfLines={1}>
								{phoneLocation(rate, t)}
							</Text>
							{tags ? <Text className="text-muted-foreground text-xs">{tags}</Text> : null}
						</ListRow>
					);
				})}
			</View>
		);
	}

	return (
		<Table testID="tax-rates-table">
			<TableHeader>
				<TableRow className="gap-3">
					<TableHead className={`px-0 ${COLUMNS.country}`}>
						<Text>{t('tax_rates.country_code')}</Text>
					</TableHead>
					<TableHead className={`px-0 ${COLUMNS.state}`}>
						<Text>{t('tax_rates.state_code')}</Text>
					</TableHead>
					<TableHead className={`px-0 ${COLUMNS.postcode}`}>
						<Text>{t('common.postcode')}</Text>
					</TableHead>
					<TableHead className={`px-0 ${COLUMNS.city}`}>
						<Text>{t('common.city')}</Text>
					</TableHead>
					<TableHead className={`px-0 ${COLUMNS.rate}`}>
						<Text className="text-right">{t('tax_rates.rate')}</Text>
					</TableHead>
					<TableHead className={`px-0 ${COLUMNS.name}`}>
						<Text>{t('tax_rates.tax_name')}</Text>
					</TableHead>
					<TableHead className={`px-0 ${COLUMNS.priority}`}>
						<Text className="text-right">{t('tax_rates.priority')}</Text>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rates.map((rate, index) => {
					const tags = rateTags(rate, t);
					return (
						<TableRow key={rate.id} index={index} className="gap-3">
							<TableCell className={`px-0 ${COLUMNS.country}`}>{location(rate.country)}</TableCell>
							<TableCell className={`px-0 ${COLUMNS.state}`}>{location(rate.state)}</TableCell>
							<TableCell className={`px-0 ${COLUMNS.postcode}`}>
								{location(rate.postcodes)}
							</TableCell>
							<TableCell className={`px-0 ${COLUMNS.city}`}>{location(rate.cities)}</TableCell>
							<TableCell className={`px-0 ${COLUMNS.rate}`}>
								<Text className="text-right tabular-nums">{percent(rate.rate ?? '0')}</Text>
							</TableCell>
							<TableCell className={`px-0 ${COLUMNS.name}`}>
								{/* Merchant-authored in WooCommerce settings, so "VAT &amp; Duty" arrives encoded. */}
								<Text decodeHtml>{rate.name}</Text>
								{tags ? <Text className="text-muted-foreground text-xs">{tags}</Text> : null}
							</TableCell>
							<TableCell className={`px-0 ${COLUMNS.priority}`}>
								<Text className="text-muted-foreground text-right tabular-nums">
									{rate.priority}
								</Text>
							</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}
