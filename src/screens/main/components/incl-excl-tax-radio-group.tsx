import * as React from 'react';
import { View } from 'react-native';

import { Control, ControllerRenderProps, FieldValues } from 'react-hook-form';

import { FormRadioGroup } from '@wcpos/tailwind/src/form';
import { Label } from '@wcpos/tailwind/src/label';
import { RadioGroupItem } from '@wcpos/tailwind/src/radio-group';

import { useT } from '../../../contexts/translations';

type Props<TFieldValues extends FieldValues> = {
	field: ControllerRenderProps<TFieldValues, any>;
	form: { control: Control<TFieldValues> };
	label: string;
};

/**
 *
 */
export const InclExclRadioGroup = <TFieldValues extends FieldValues>({
	field,
	form,
	label,
}: Props<TFieldValues>) => {
	const t = useT();

	/**
	 *
	 */
	const onLabelPress = React.useCallback(
		(value: 'incl' | 'excl') => {
			return () => {
				form.setValue(field.name, value);
			};
		},
		[field.name, form]
	);

	/**
	 *
	 */
	return (
		<FormRadioGroup label={label} className="gap-2" {...field}>
			{[
				{ label: t('Including tax', { _tags: 'core' }), value: 'incl' },
				{ label: t('Excluding tax', { _tags: 'core' }), value: 'excl' },
			].map((option) => {
				const id = `${field.name}-${option.value}`;

				return (
					<View key={option.value} className={'flex-row gap-2 items-center'}>
						<RadioGroupItem aria-labelledby={`label-for-${id}`} value={option.value} />
						<Label
							nativeID={`label-for-${id}`}
							className="capitalize"
							onPress={onLabelPress(option.value)}
						>
							{option.label}
						</Label>
					</View>
				);
			})}
		</FormRadioGroup>
	);
};
