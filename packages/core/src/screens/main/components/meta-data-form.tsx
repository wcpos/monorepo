import * as React from 'react';
import { View } from 'react-native';

import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import { FormField, FormInput } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../contexts/translations';

/**
 *
 */
export const metaDataSchema = z.array(
	z.object({
		id: z.number().optional(),
		key: z.string(),
		value: z.string().nullable(),
		display_key: z.string().optional(),
		display_value: z.string().optional(),
	})
);

interface MetaDataFormProps {
	name?: string;
	withDisplayValues?: boolean;
}

/**
 *
 */
export function MetaDataForm({ name = 'meta_data', withDisplayValues }: MetaDataFormProps) {
	const t = useT();
	const { control, setValue, getValues } = useFormContext();
	const { fields, append, remove } = useFieldArray({
		control,
		name,
	});

	// Watch the meta_data array to get up-to-date values
	const watchedFields = useWatch({ name, control }) || [];

	return (
		<Collapsible>
			<CollapsibleTrigger>
				<Text>{t('common.meta_data')}</Text>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<VStack>
					{fields.map((field, index) => {
						const value = watchedFields[index]?.value;
						// Hide items with value = null
						if (value === null) {
							return null;
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
								<VStack className="flex-1 flex-col p-2">
									<FormField
										control={control}
										name={`${name}.${index}.key`}
										render={({ field }) => <FormInput label={t('common.key')} {...field} />}
									/>
									{withDisplayValues && (
										<FormField
											control={control}
											name={`${name}.${index}.display_key`}
											render={({ field }) => (
												<FormInput label={t('common.display_key')} {...field} />
											)}
										/>
									)}
								</VStack>
								<VStack className="flex-1 flex-col p-2">
									<FormField
										control={control}
										name={`${name}.${index}.value`}
										render={({ field }) => <FormInput label={t('common.value')} {...field} />}
									/>
									{withDisplayValues && (
										<FormField
											control={control}
											name={`${name}.${index}.display_value`}
											render={({ field }) => (
												<FormInput label={t('common.display_value')} {...field} />
											)}
										/>
									)}
								</VStack>
								<View className="p-2">
									<Tooltip>
										<TooltipTrigger asChild>
											<IconButton
												variant="destructive"
												name="circleMinus"
												onPress={() => {
													const metaData = getValues(name);
													const item = metaData[index];
													if (item.id) {
														// Set the value to null but keep the item
														setValue(`${name}.${index}.value`, null);
													} else {
														// Remove the item entirely
														remove(index);
													}
												}}
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
					<HStack>
						<Button variant="outline" onPress={() => append({ key: '', value: '' })}>
							<ButtonText>{t('common.add_meta_data')}</ButtonText>
						</Button>
					</HStack>
				</VStack>
			</CollapsibleContent>
		</Collapsible>
	);
}
