import * as React from 'react';

import isEmpty from 'lodash/isEmpty';

import {
	Command,
	CommandButton,
	CommandEmpty,
	CommandItem,
	CommandList,
	CommandInput,
} from '@wcpos/tailwind/src/command';
import { Input } from '@wcpos/tailwind/src/input';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/tailwind/src/popover';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/tailwind/src/select';
import { Text } from '@wcpos/tailwind/src/text';

import useCountries, { CountriesProvider } from '../../../../contexts/countries';
import { useT } from '../../../../contexts/translations';

interface Props {
	value: string;
	onChange: (value: string) => void;
}

/**
 *
 */
const _StateSelect = ({ value, onChange }: Props) => {
	const t = useT();
	const country = useCountries();
	const options = React.useMemo(
		() =>
			country.states
				? country.states.map((state) => ({
						label: state.name,
						value: state.code,
					}))
				: [],
		[country.states]
	);

	/**
	 * HACK: if old state value is set and country changes
	 */
	React.useEffect(() => {
		const selected = options.find((option) => option.value === value);
		if (!isEmpty(value) && !selected) {
			onChange('');
		}
	}, [onChange, options, value]);

	/**
	 * If no state options, let them type
	 */
	if (isEmpty(options)) {
		return <Input value={value} onChangeText={onChange} />;
	}

	/**
	 * If less than 10 options, show as select
	 */
	if (options.length < 10) {
		return (
			<Select onValueChange={(val) => onChange(val.value)}>
				<SelectTrigger>
					<SelectValue placeholder={t('Select State', { _tags: 'core' })}>{value}</SelectValue>
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
	}

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
							<CommandItem key={option.value} onSelect={() => onChange(option.value)}>
								{option.label}
							</CommandItem>
						))}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
};

type StateSelectProps = Props & {
	country: string;
};

/**
 *
 */
export const StateSelect = ({ country, ...props }: StateSelectProps) => {
	return (
		<CountriesProvider countryCode={country}>
			<_StateSelect {...props} />
		</CountriesProvider>
	);
};
