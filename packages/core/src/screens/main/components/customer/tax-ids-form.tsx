/**
 * Reusable structured tax-IDs sub-form.
 *
 * Renders a property row per {@link TaxId} (type select, value input, country
 * input) with its Remove; the caller's add row appends. Used by:
 * - the customer create/edit form (writes to `customer.tax_ids`)
 * - the cart customer edit form (writes to `order.tax_ids`)
 * - the order edit form (writes to `order.tax_ids`)
 *
 * Format-only validation. Network verification is a separate, deferred concern.
 */

import * as React from 'react';
import { View } from 'react-native';

import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import * as z from 'zod';

import { FormField, FormInput, FormSelect } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { PropertyRow, PropertyVerb } from '@wcpos/components/property-row';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from '@wcpos/components/select';
import { VStack } from '@wcpos/components/vstack';
import { useDocField } from '@wcpos/query';

import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import {
	isValidTaxIdFormat,
	splitTaxIdTypesForCountry,
	suggestTaxIdTypes,
	TAX_ID_DEFAULT_COUNTRIES,
	TAX_ID_PLACEHOLDERS,
	TAX_ID_TYPES,
	type TaxIdType,
	useTaxIdLabels,
} from '../../../../lib/tax-id';

import type { Control, FieldValues, Path } from 'react-hook-form';

interface TaxIdsFormProps {
	/** RHF field path (e.g. `tax_ids` for customer form, also `tax_ids` for order). */
	name?: string;
	/** The rows' testID prefix. */
	testID?: string;
}

type TaxIdRow = {
	type: TaxIdType;
	value: string;
	country: string;
	label: string | null;
	verified: null;
};

/** The country a new row and the dropdown order follow: billing first, then the store. */
function useTaxIdCountry<T extends FieldValues>(control: Control<T>) {
	const billingCountry = useWatch({ control, name: 'billing.country' as Path<T> }) as
		string | undefined;
	const { store } = useAppState();
	const storeCountry = useDocField(store, (value) => value.store_country) as string | undefined;
	return (billingCountry || storeCountry || '').trim().toUpperCase();
}

/** A fresh row for the billing country, falling back to the store; hosts pass their control. */
export function useNewTaxIdRow<T extends FieldValues>(control: Control<T>): () => TaxIdRow {
	const country = useTaxIdCountry(control);
	return React.useCallback(() => {
		const [type = 'other'] = suggestTaxIdTypes(country);
		return {
			type,
			value: '',
			country: TAX_ID_DEFAULT_COUNTRIES[type] ?? country,
			label: null,
			verified: null,
		};
	}, [country]);
}

const TaxIdTypeOptionsContext = React.createContext<{
	suggested: TaxIdType[];
	rest: TaxIdType[];
	labels: Record<TaxIdType, string>;
}>({ suggested: [], rest: [...TAX_ID_TYPES], labels: {} as Record<TaxIdType, string> });

/** FormSelect supplies a scalar; the grouped Select consumes an option. */
function TaxIdTypeSelect({
	value,
	onChange,
	'aria-labelledby': labelledBy,
}: {
	value?: string;
	onChange?: (value: string | undefined) => void;
	'aria-labelledby'?: string;
}) {
	const t = useT();
	const { suggested, rest, labels } = React.useContext(TaxIdTypeOptionsContext);
	const selected = value ? { value, label: labels[value as TaxIdType] ?? value } : undefined;
	const renderItem = (type: TaxIdType) => (
		<SelectItem key={type} value={type} label={labels[type]} />
	);
	return (
		<Select value={selected} onValueChange={(option) => onChange?.(option?.value)}>
			<SelectTrigger aria-labelledby={labelledBy}>
				<SelectValue placeholder={t('tax_id.type_label')} />
			</SelectTrigger>
			<SelectContent matchWidth>
				{suggested.length > 0 && (
					<>
						<SelectGroup>{suggested.map(renderItem)}</SelectGroup>
						<SelectSeparator />
					</>
				)}
				<SelectGroup>{rest.map(renderItem)}</SelectGroup>
			</SelectContent>
		</Select>
	);
}

export function TaxIdsForm({ name = 'tax_ids', testID }: TaxIdsFormProps) {
	const t = useT();
	const { control, setValue } = useFormContext();
	const { fields, remove } = useFieldArray({ control, name });
	const labels = useTaxIdLabels();
	const country = useTaxIdCountry(control);
	const options = React.useMemo(() => splitTaxIdTypesForCountry(country), [country]);
	const watched = (useWatch({ name, control }) ?? []) as {
		type?: TaxIdType;
		value?: string;
	}[];

	const handleTypeChange = React.useCallback(
		(index: number, nextType: TaxIdType) => {
			setValue(`${name}.${index}.type`, nextType, { shouldDirty: true });
			const defaultCountry = TAX_ID_DEFAULT_COUNTRIES[nextType];
			setValue(`${name}.${index}.country`, defaultCountry ?? country, { shouldDirty: true });
		},
		[name, setValue, country]
	);

	const content = (
		<VStack className="gap-0">
			{fields.map((field, index) => {
				const row = watched[index];
				const type = (row?.type ?? 'eu_vat') as TaxIdType;
				const value = row?.value ?? '';
				const showFormatWarning = value.length > 0 && !isValidTaxIdFormat(type, value);
				const inputs = (
					<>
						<View className="w-40 p-2">
							<FormField
								control={control}
								name={`${name}.${index}.type`}
								render={({ field: { value: rhfValue, onChange: _ignored, ...rest } }) => (
									<FormSelect
										customComponent={TaxIdTypeSelect}
										label={t('tax_id.type_label')}
										value={rhfValue as string}
										onChange={(next) => handleTypeChange(index, next as TaxIdType)}
										{...rest}
									/>
								)}
							/>
						</View>
						<VStack className="flex-1 p-2">
							<FormField
								control={control}
								name={`${name}.${index}.value`}
								render={({ field: rhf }) => (
									<FormInput
										label={t('tax_id.value_label')}
										placeholder={TAX_ID_PLACEHOLDERS[type]}
										{...rhf}
										value={rhf.value ?? ''}
										description={showFormatWarning ? t('tax_id.invalid_format') : undefined}
									/>
								)}
							/>
						</VStack>
						<View className="w-24 p-2">
							<FormField
								control={control}
								name={`${name}.${index}.country`}
								render={({ field: rhf }) => (
									<FormInput
										label={t('tax_id.country_label')}
										{...rhf}
										value={rhf.value ?? ''}
										maxLength={2}
										autoCapitalize="characters"
									/>
								)}
							/>
						</View>
					</>
				);
				return (
					<PropertyRow
						key={field.id}
						testID={`${testID}-row-tax_id-${index}`}
						label={t('tax_id.tax_id')}
						align="top"
						// The list's one Saved mark sits on its first row.
						name={index === 0 ? name : []}
						verb={
							<PropertyVerb
								testID={`${testID}-remove-tax_id-${index}`}
								onPress={() => remove(index)}
							>
								{t('common.remove')}
							</PropertyVerb>
						}
					>
						<HStack className="flex-wrap items-start gap-0">{inputs}</HStack>
					</PropertyRow>
				);
			})}
		</VStack>
	);
	return (
		<TaxIdTypeOptionsContext.Provider value={{ ...options, labels }}>
			{content}
		</TaxIdTypeOptionsContext.Provider>
	);
}

/**
 * Zod schema for the structured tax-ids array. Compose into form schemas via
 * `tax_ids: taxIdsFormSchema`. Format/empty-value validation is intentionally
 * permissive at the form layer — strict checks live in the validator helpers
 * and the receipt-side schema; over-strict form rules block partial entry.
 */
export const taxIdsFormSchema = z
	.array(
		z.object({
			type: z.enum(TAX_ID_TYPES as unknown as [TaxIdType, ...TaxIdType[]]),
			value: z.string(),
			country: z.string().nullable().optional(),
			label: z.string().nullable().optional(),
			verified: z
				.object({
					status: z.enum(['verified', 'unverified', 'pending']),
					source: z.string().optional(),
					verified_name: z.string().optional(),
					verified_at: z.string().optional(),
				})
				.nullable()
				.optional(),
		})
	)
	.optional();
