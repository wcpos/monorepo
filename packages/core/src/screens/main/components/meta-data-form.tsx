import * as React from 'react';

import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';

import { FormField, FormInput } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { PropertyRow, PropertyVerb } from '@wcpos/components/property-row';
import { VStack } from '@wcpos/components/vstack';

import { formatMetaDataValue, parseMetaDataInput } from './format-meta-data-value';
import { useT } from '../../../contexts/translations';

export { metaDataSchema } from './meta-data-schema';

interface MetaDataFormProps {
	name?: string;
	hiddenKeys?: readonly string[];
	/** The rows' testID prefix. */
	testID?: string;
}

/** A freshly appended custom field. */
export const META_DATA_DEFAULT_ROW = { key: '', value: '' };

/**
 * A record's custom fields as property rows: a Custom field row per entry with its Remove,
 * a variation's attribute locked. The add button is the caller's.
 */
export function MetaDataForm({ name = 'meta_data', hiddenKeys, testID }: MetaDataFormProps) {
	const t = useT();
	const { control, setValue, getValues, setError, clearErrors } = useFormContext();
	const { fields, remove } = useFieldArray({
		control,
		name,
	});

	// Watch the meta_data array to get up-to-date values
	const watchedFields = useWatch({ name, control }) || [];
	const removeAt = (index: number) => {
		if (getValues(name)[index].id) {
			// Set the value to null but keep the item
			setValue(`${name}.${index}.value`, null);
		} else {
			// Remove the item entirely
			remove(index);
		}
	};

	// The list has one Saved mark, on its first editable row (a tax ID list marks its first too).
	const shown = (row?: { value?: unknown; key?: string; attr_id?: unknown }) =>
		row?.value !== null && !hiddenKeys?.includes(row?.key as string) && row?.attr_id == null;
	const first = fields.findIndex((_, index) => shown(watchedFields[index]));

	return (
		<VStack>
			{fields.map((field, index) => {
				const value = watchedFields[index]?.value;
				// Hide tombstones and caller-protected metadata.
				if (value === null || hiddenKeys?.includes(watchedFields[index]?.key)) {
					return null;
				}
				// A variation's attribute is its identity (rule 6): locked, its display key and value.
				if (watchedFields[index]?.attr_id != null) {
					const row = watchedFields[index];
					return (
						<PropertyRow
							key={field.id}
							testID={`${testID}-row-meta-${index}`}
							label={String(row.display_key ?? row.key ?? '')}
						>
							{formatMetaDataValue(row.display_value ?? value)}
						</PropertyRow>
					);
				}
				return (
					<PropertyRow
						key={field.id}
						testID={`${testID}-row-meta-${index}`}
						label={t('common.custom_field')}
						compound
						name={index === first ? name : []}
						verb={
							<PropertyVerb
								testID={`${testID}-remove-meta-${index}`}
								onPress={() => removeAt(index)}
							>
								{t('common.remove')}
							</PropertyVerb>
						}
					>
						<HStack className="gap-2">
							<VStack className="flex-1">
								<FormField
									control={control}
									name={`${name}.${index}.key`}
									render={({ field }) => (
										<FormInput
											placeholder={t('common.key')}
											{...field}
											onChange={(key) => {
												if (hiddenKeys?.includes(String(key))) {
													setError(field.name, {
														type: 'validate',
														message: t('common.meta_key_protected'),
													});
													return;
												}
												clearErrors(field.name);
												field.onChange(key);
											}}
										/>
									)}
								/>
							</VStack>
							<VStack className="flex-1">
								<FormField
									control={control}
									name={`${name}.${index}.value`}
									render={({ field }) => (
										<FormInput
											placeholder={t('common.value')}
											{...field}
											value={formatMetaDataValue(field.value)}
											onChange={(text) => field.onChange(parseMetaDataInput(String(text ?? '')))}
										/>
									)}
								/>
							</VStack>
						</HStack>
					</PropertyRow>
				);
			})}
		</VStack>
	);
}
