import * as React from 'react';
import { View } from 'react-native';

import { FormRadioGroup } from '@wcpos/components/src/form';
import { Label } from '@wcpos/components/src/label';
import { RadioGroupItem } from '@wcpos/components/src/radio-group';

import { useT } from '../../../contexts/translations';

/**
 *
 */
export const TaxStatusRadioGroup = ({ form, field }) => {
	const t = useT();

	/**
	 *
	 */
	const onLabelPress = React.useCallback(
		(label: 'taxable' | 'none') => {
			return () => {
				form.setValue('tax_status', label);
			};
		},
		[form]
	);

	/**
	 *
	 */
	return (
		<FormRadioGroup label={t('Tax Status', { _tags: 'core' })} className="gap-2" {...field}>
			{(['taxable', 'none'] as const).map((value) => {
				return (
					<View key={value} className={'flex-row gap-2 items-center'}>
						<RadioGroupItem aria-labelledby={`label-for-${value}`} value={value} />
						<Label
							nativeID={`label-for-${value}`}
							className="capitalize"
							onPress={onLabelPress(value)}
						>
							{value}
						</Label>
					</View>
				);
			})}
		</FormRadioGroup>
	);
};
