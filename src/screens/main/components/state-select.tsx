import * as React from 'react';

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/components/src/select';

import { useStates } from '../../../contexts/countries';
import { useT } from '../../../contexts/translations';

/**
 *
 */
export const StateSelect = ({ value, onValueChange, ...props }) => {
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
			value={{ value, label: options.find((option) => option.value === value)?.label }}
			onValueChange={(val) => onValueChange(val.value)}
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
