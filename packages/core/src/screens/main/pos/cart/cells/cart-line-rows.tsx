import * as React from 'react';
import { View } from 'react-native';

import { useFormContext, useWatch } from 'react-hook-form';
import * as z from 'zod';

import { HStack } from '@wcpos/components/hstack';
import { PropertyAdd, PropertyAddRow, PropertyRow } from '@wcpos/components/property-row';

import { useT } from '../../../../../contexts/translations';
import { AmountUnitToggle } from '../../../components/amount-unit-toggle';
import { META_DATA_DEFAULT_ROW, MetaDataForm } from '../../../components/meta-data-form';
import { TaxSelect } from '../../../components/tax-select';

type Prefix = 'line-item' | 'fee-line' | 'shipping-line';

/** A fee's amount as Add fee and the fee sheet both hold it: Woo's text, never below zero. */
export const feeAmountSchema = (message: string) =>
	z
		.string()
		.refine((value) => Number(value) >= 0, { message })
		.optional();
const TAX_MARK = ['tax_status', 'tax_class'];

/** Tax status and class as one fact (property rows rule 4); each change writes its own root. */
export function TaxRow({ prefix }: { prefix: Prefix }) {
	const t = useT();
	const form = useFormContext();
	const [status, taxClass] = useWatch({ control: form.control, name: ['tax_status', 'tax_class'] });
	return (
		<PropertyRow prefix={prefix} id="tax" label={t('common.tax')} name={TAX_MARK}>
			<TaxSelect
				status={status}
				taxClass={taxClass ?? 'standard'}
				onChange={(next) => {
					form.setValue('tax_status', next.tax_status);
					form.setValue('tax_class', next.tax_class);
				}}
				testID={`${prefix}-tax-select`}
				aria-labelledby={`${prefix}-tax-form-item`}
			/>
		</PropertyRow>
	);
}

/** The amount, with the currency / % unit in the row when the line can be a percentage. */
export function AmountRow(props: {
	prefix: Prefix;
	percent?: boolean;
	onPercent?: (next: boolean) => void;
	mark: string | string[];
	children: React.ReactNode;
}) {
	const { prefix, onPercent } = props;
	const t = useT();
	return (
		<PropertyRow prefix={prefix} id="amount" label={t('pos_cart.amount')} name={props.mark}>
			<HStack className="gap-2">
				<View className="flex-1">{props.children}</View>
				{onPercent && (
					<AmountUnitToggle
						percent={!!props.percent}
						onChange={onPercent}
						testID={`${prefix}-percent-switch`}
						aria-labelledby={`${prefix}-amount-form-item`}
					/>
				)}
			</HStack>
		</PropertyRow>
	);
}

/**
 * The line's custom fields, one row each, then the add row: the caller's offered facts
 * (`children`) and Custom field last (rule 11). Keys starting with `_` (`_woocommerce_pos_data`,
 * `_reduced_stock`) are developer facts: they stay in the JSON tab (rule 10) and in the write.
 */
export function CustomFieldRows(props: {
	prefix: Prefix;
	meta?: readonly { key?: string }[] | null;
	children?: React.ReactNode;
}) {
	const { prefix, meta } = props;
	const t = useT();
	const form = useFormContext();
	const hiddenKeys = React.useMemo(
		() => (meta ?? []).map((row) => String(row?.key ?? '')).filter((key) => key.startsWith('_')),
		[meta]
	);
	return (
		<>
			<MetaDataForm testID={prefix} hiddenKeys={hiddenKeys} />
			<PropertyAddRow>
				{props.children}
				<PropertyAdd
					testID={`${prefix}-add-meta_data`}
					label={t('common.custom_field')}
					onPress={() =>
						form.setValue('meta_data', [
							...(form.getValues('meta_data') ?? []),
							META_DATA_DEFAULT_ROW,
						])
					}
				/>
			</PropertyAddRow>
		</>
	);
}
