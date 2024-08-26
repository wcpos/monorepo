import * as React from 'react';

import {
	Command,
	CommandInput,
	CommandEmpty,
	CommandList,
	CommandItem,
	CommandButton,
} from '@wcpos/components/src/command';
import { Popover, PopoverTrigger, PopoverContent } from '@wcpos/components/src/popover';
import { Text } from '@wcpos/components/src/text';

import useCountries, { CountriesProvider } from '../../../../contexts/countries';
import { useT } from '../../../../contexts/translations';

/**
 *
 */
const _CountrySelect = ({ value, onChange }) => {
	const allCountries = useCountries();
	const t = useT();

	/**
	 *
	 */
	const options = React.useMemo(
		() =>
			allCountries.map((country) => ({
				label: country.name,
				value: country.code,
			})),
		[allCountries]
	);

	/**
	 *
	 */
	const displayLabel = React.useMemo(() => {
		const selected = options.find((option) => option.value === value);
		return selected ? selected.label : t('Select Country', { _tags: 'core' });
	}, [options, t, value]);

	/**
	 *
	 */
	return (
		<Popover>
			<PopoverTrigger asChild>
				<CommandButton>
					<Text>{displayLabel}</Text>
				</CommandButton>
			</PopoverTrigger>
			<PopoverContent className="p-0">
				<Command>
					<CommandInput placeholder={t('Search Countries', { _tags: 'core' })} />
					<CommandEmpty>{t('No country found', { _tags: 'core' })}</CommandEmpty>
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

export const CountrySelect = (props) => {
	return (
		<CountriesProvider>
			<_CountrySelect {...props} />
		</CountriesProvider>
	);
};
