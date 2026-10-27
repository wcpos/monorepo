import * as React from 'react';
import { View } from 'react-native';

import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';

import { Button, ButtonText } from '@wcpos/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import { FormField, FormInput, SavedMark, useSavedName } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { IconButton } from '@wcpos/components/icon-button';
import { PropertyRow, PropertyVerb } from '@wcpos/components/property-row';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import { VStack } from '@wcpos/components/vstack';

import { formatMetaDataValue, parseMetaDataInput } from './format-meta-data-value';
import { useT } from '../../../contexts/translations';

export { metaDataSchema } from './meta-data-schema';

interface MetaDataFormProps {
	name?: string;
	hiddenKeys?: readonly string[];
	/** Property rows: a Custom field row per entry with its Remove; no fold, no add (the caller's). */
	rows?: boolean;
	/** The rows' testID prefix. */
	testID?: string;
}

/** A freshly appended custom field. */
export const META_DATA_DEFAULT_ROW = { key: '', value: '' };

/**
 *
 */
export function MetaDataForm({ name = 'meta_data', hiddenKeys, rows, testID }: MetaDataFormProps) {
	const t = useT();
	const { control, setValue, getValues, setError, clearErrors } = useFormContext();
	const { fields, append, remove } = useFieldArray({
		control,
		name,
	});

	// Watch the meta_data array to get up-to-date values
	const watchedFields = useWatch({ name, control }) || [];
	const savedName = useSavedName();
	const removeAt = (index: number) => {
		if (getValues(name)[index].id) {
			// Set the value to null but keep the item
			setValue(`${name}.${index}.value`, null);
		} else {
			// Remove the item entirely
			remove(index);
		}
	};

	const Fold = rows ? React.Fragment : Collapsible;
	const FoldContent = rows ? React.Fragment : CollapsibleContent;
	return (
		<Fold>
			{!rows && (
				<CollapsibleTrigger>
					<Text>{t('common.meta_data')}</Text>
				</CollapsibleTrigger>
			)}
			<FoldContent>
				<VStack>
					{fields.map((field, index) => {
						const value = watchedFields[index]?.value;
						// Hide tombstones and caller-protected metadata.
						if (value === null || hiddenKeys?.includes(watchedFields[index]?.key)) {
							return null;
						}
						const inputs = (
							<>
								<VStack className={rows ? 'flex-1' : 'flex-1 flex-col p-2'}>
									<FormField
										control={control}
										name={`${name}.${index}.key`}
										render={({ field }) => (
											<FormInput
												label={rows ? undefined : t('common.key')}
												placeholder={rows ? t('common.key') : undefined}
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
								<VStack className={rows ? 'flex-1' : 'flex-1 flex-col p-2'}>
									<FormField
										control={control}
										name={`${name}.${index}.value`}
										render={({ field }) => (
											<FormInput
												label={rows ? undefined : t('common.value')}
												placeholder={rows ? t('common.value') : undefined}
												{...field}
												value={formatMetaDataValue(field.value)}
												onChange={(text) => field.onChange(parseMetaDataInput(String(text ?? '')))}
											/>
										)}
									/>
								</VStack>
							</>
						);
						// A variation's attribute is its identity (rule 6): locked, its display key and value.
						if (rows && watchedFields[index]?.attr_id != null) {
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
						if (rows) {
							return (
								<PropertyRow
									key={field.id}
									testID={`${testID}-row-meta-${index}`}
									label={t('common.custom_field')}
									trailing={
										savedName === name ? (
											<SavedMark name={name} label={t('settings.saved')} />
										) : (
											<PropertyVerb
												testID={`${testID}-remove-meta-${index}`}
												onPress={() => removeAt(index)}
											>
												{t('common.remove')}
											</PropertyVerb>
										)
									}
								>
									<HStack className="gap-2">{inputs}</HStack>
								</PropertyRow>
							);
						}
						return (
							<HStack key={field.id} className="web:hover:bg-accent items-start gap-0">
								<View className="w-20 p-2">
									<FormField
										control={control}
										name={`${name}.${index}.id`}
										render={({ field }) => <FormInput label={t('common.id')} {...field} readOnly />}
									/>
								</View>
								{inputs}
								<View className="p-2">
									<Tooltip>
										<TooltipTrigger asChild>
											<IconButton
												variant="destructive"
												name="decrement"
												accessibilityLabel={t('common.remove_item')}
												onPress={() => removeAt(index)}
											/>
										</TooltipTrigger>
										<TooltipContent>
											<Text>{t('common.remove_item')}</Text>
										</TooltipContent>
									</Tooltip>
								</View>
							</HStack>
						);
					})}
					{!rows && (
						<HStack>
							<Button variant="outline" onPress={() => append({ ...META_DATA_DEFAULT_ROW })}>
								<ButtonText>{t('common.add_meta_data')}</ButtonText>
							</Button>
						</HStack>
					)}
				</VStack>
			</FoldContent>
		</Fold>
	);
}
