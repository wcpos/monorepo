import * as React from 'react';

import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';

import { FormField, FormInput } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { PropertyRow, PropertyVerb } from '@wcpos/components/property-row';
import { Text } from '@wcpos/components/text';
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

/** A custom field whose key starts with `_` is private: a plugin's or the till's own bookkeeping. */
const isPrivateMetaKey = (key: unknown) => typeof key === 'string' && key.startsWith('_');

/**
 * A record's custom fields as property rows: a Custom field row per public entry with its Remove,
 * a variation's attribute locked, then one Hidden fields row (N fields · Show) for the private
 * entries. Show opens them beneath it, indented, editable, with Remove; Hide puts them away. This is
 * the one fold on a record form (Paul, 2026-10-30). Keys in `hiddenKeys` never show and are never
 * counted. The add button is the caller's.
 */
export function MetaDataForm({ name = 'meta_data', hiddenKeys, testID }: MetaDataFormProps) {
	const t = useT();
	const [open, setOpen] = React.useState(false);
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

	// Tombstones and caller-protected metadata are never rows. A row is private by the array's
	// snapshot key, so a new row (key '') stays where it is while `_…` is typed into it.
	const shown: number[] = [];
	const hidden: number[] = [];
	fields.forEach((field, index) => {
		const row = watchedFields[index];
		if (row?.value === null || hiddenKeys?.includes(row?.key)) return;
		const isPrivate = row?.attr_id == null && isPrivateMetaKey((field as { key?: unknown }).key);
		(isPrivate ? hidden : shown).push(index);
	});
	// The list has one Saved mark, on its first editable row (a tax ID list marks its first too);
	// with none drawn, the Hidden fields row holds it.
	const host = [...shown, ...(open ? hidden : [])].find(
		(index) => watchedFields[index]?.attr_id == null
	);

	const renderRow = (index: number, indent?: boolean) => {
		const field = fields[index];
		const row = watchedFields[index];
		// A variation's attribute is its identity (rule 6): locked, its display key and value.
		if (row?.attr_id != null) {
			return (
				<PropertyRow
					key={field.id}
					testID={`${testID}-row-meta-${index}`}
					label={String(row.display_key ?? row.key ?? '')}
				>
					{formatMetaDataValue(row.display_value ?? row.value)}
				</PropertyRow>
			);
		}
		return (
			<PropertyRow
				key={field.id}
				testID={`${testID}-row-meta-${index}`}
				label={t('common.custom_field')}
				compound
				indent={indent}
				name={index === host ? name : []}
				verb={
					<PropertyVerb testID={`${testID}-remove-meta-${index}`} onPress={() => removeAt(index)}>
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
	};

	return (
		<VStack>
			{shown.map((index) => renderRow(index))}
			{hidden.length > 0 ? (
				<PropertyRow
					testID={`${testID}-hidden-fields`}
					label={t('common.hidden_fields')}
					name={host === undefined ? name : []}
					verb={
						<PropertyVerb
							testID={`${testID}-hidden-fields-toggle`}
							onPress={() => setOpen((wasOpen) => !wasOpen)}
						>
							{open ? t('common.hide') : t('common.show')}
						</PropertyVerb>
					}
				>
					<Text>{t('common.n_fields', { count: hidden.length })}</Text>
				</PropertyRow>
			) : null}
			{open ? hidden.map((index) => renderRow(index, true)) : null}
		</VStack>
	);
}
