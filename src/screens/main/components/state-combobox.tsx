import * as React from 'react';

import {
	Command,
	CommandButton,
	CommandEmpty,
	CommandItem,
	CommandList,
	CommandInput,
} from '@wcpos/components/src/command';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/src/popover';
import { Text } from '@wcpos/components/src/text';

import { useStates } from '../../../contexts/countries';
import { useT } from '../../../contexts/translations';

/**
 *
 */
export const StateCombobox = ({ value, onValueChange, ...props }) => {
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

	/**
	 *
	 */
	return (
		<Popover>
			<PopoverTrigger asChild>
				<CommandButton>
					<Text>{value}</Text>
				</CommandButton>
			</PopoverTrigger>
			<PopoverContent className="p-0">
				<Command>
					<CommandInput placeholder={t('Search states', { _tags: 'core' })} />
					<CommandEmpty>{t('No state found', { _tags: 'core' })}</CommandEmpty>
					<CommandList>
						{options.map((option) => (
							<CommandItem key={option.value} onSelect={() => onValueChange(option.value)}>
								{option.label}
							</CommandItem>
						))}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
};
