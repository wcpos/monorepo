import * as React from 'react';
import { View } from 'react-native';

import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import * as z from 'zod';

import { ButtonText, Button } from '@wcpos/components/src/button';
import {
	Collapsible,
	CollapsibleTrigger,
	CollapsibleContent,
} from '@wcpos/components/src/collapsible';
import { FormField, FormInput } from '@wcpos/components/src/form';
import { HStack } from '@wcpos/components/src/hstack';
import { IconButton } from '@wcpos/components/src/icon-button';
import { Text } from '@wcpos/components/src/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/src/tooltip';
import { VStack } from '@wcpos/components/src/vstack';

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
export const MetaDataForm: React.FC<MetaDataFormProps> = ({
	name = 'meta_data',
	withDisplayValues,
}) => {
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
				<Text>{t('Meta Data', { _tags: 'core' })}</Text>
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
							<HStack key={field.id} className="web:hover:bg-accent gap-0 items-start">
								<View className="w-20 p-2">
									<FormField
										control={control}
										name={`${name}.${index}.id`}
										render={({ field }) => (
											<FormInput label={t('ID', { _tags: 'core' })} {...field} readOnly />
										)}
									/>
								</View>
								<VStack className="flex-1 flex-col p-2">
									<FormField
										control={control}
										name={`${name}.${index}.key`}
										render={({ field }) => (
											<FormInput label={t('Key', { _tags: 'core' })} {...field} />
										)}
									/>
									{withDisplayValues && (
										<FormField
											control={control}
											name={`${name}.${index}.display_key`}
											render={({ field }) => (
												<FormInput label={t('Display Key', { _tags: 'core' })} {...field} />
											)}
										/>
									)}
								</VStack>
								<VStack className="flex-1 flex-col p-2">
									<FormField
										control={control}
										name={`${name}.${index}.value`}
										render={({ field }) => (
											<FormInput label={t('Value', { _tags: 'core' })} {...field} />
										)}
									/>
									{withDisplayValues && (
										<FormField
											control={control}
											name={`${name}.${index}.display_value`}
											render={({ field }) => (
												<FormInput label={t('Display Value', { _tags: 'core' })} {...field} />
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
											<Text>{t('Remove item', { _tags: 'core' })}</Text>
										</TooltipContent>
									</Tooltip>
								</View>
							</HStack>
						);
					})}
					<HStack>
						<Button variant="outline" onPress={() => append({ key: '', value: '' })}>
							<ButtonText>{t('Add meta data', { _tags: 'core' })}</ButtonText>
						</Button>
					</HStack>
				</VStack>
			</CollapsibleContent>
		</Collapsible>
	);
};
