import * as React from 'react';

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/components/select';

import { StatesProvider, useStates } from '../../../../contexts/countries';
import { useT } from '../../../../contexts/translations';

/**
 *
 */
export const StateSelectBase = ({ value, ...props }: React.ComponentProps<typeof Select>) => {
	const t = useT();
	const states = useStates();
	const options = React.useMemo(
		() =>
			(states || []).map((state) => ({
				label: state.name,
				value: state.code,
			})),
		[states]
	);

	// /**
	//  * HACK: if old state value is set and country changes
	//  */
	// React.useEffect(() => {
	// 	const selected = options.find((option) => option.value === value);
	// 	if (!isEmpty(value) && !selected) {
	// 		onChange('');
	// 	}
	// }, [onChange, options, value]);

	return (
		<Select
			value={{ ...value, label: options.find((option) => option.value === value?.value)?.label }}
			{...props}
		>
			<SelectTrigger>
				<SelectValue placeholder={t('Select State', { _tags: 'core' })} />
			</SelectTrigger>
			<SelectContent>
				{options.map((option) => (
					<SelectItem key={option.value} value={option.value} label={option.label}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
};

/**
 * We need the provider before the combobox list so that we can display the label
 */
export const StateSelect = ({
	countryCode,
	...props
}: React.ComponentProps<typeof Select> & { countryCode: string }) => {
	return (
		<StatesProvider countryCode={countryCode}>
			<StateSelectBase {...props} />
		</StatesProvider>
	);
};
