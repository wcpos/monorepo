import * as React from 'react';

import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import {
	Command,
	CommandInput,
	CommandEmpty,
	CommandList,
	CommandItem,
} from '@wcpos/tailwind/src/command';
import { Label } from '@wcpos/tailwind/src/label';
import { Popover, PopoverTrigger, PopoverContent } from '@wcpos/tailwind/src/popover';
import { VStack } from '@wcpos/tailwind/src/vstack';

import useCountries, { CountriesProvider } from '../../../../contexts/countries';
import { useT } from '../../../../contexts/translations';

/**
 *
 */
const _CountrySelect = ({ label, value, onChange }) => {
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
		return selected ? selected.label : '';
	}, [options, value]);

	/**
	 *
	 */
	return (
		<VStack>
			<Label nativeID="country">{label}</Label>
			<Popover>
				<PopoverTrigger asChild>
					<Button variant="outline">
						<ButtonText>{displayLabel}</ButtonText>
					</Button>
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
		</VStack>
	);
};

export const CountrySelect = (props) => {
	return (
		<CountriesProvider>
			<_CountrySelect {...props} />
		</CountriesProvider>
	);
};
