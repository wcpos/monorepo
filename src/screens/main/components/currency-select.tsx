import * as React from 'react';

import { decode } from 'html-entities';

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

import useCurrencies, { CurrenciesProvider } from '../../../contexts/currencies';
import { useT } from '../../../contexts/translations';

/**
 *
 */
export const _CurrencySelect = ({ label, value = 'USD', onChange }) => {
	const allCurrencies = useCurrencies();
	const t = useT();

	/**
	 *
	 */
	const options = React.useMemo(
		() =>
			allCurrencies.map((currency) => ({
				label: `${currency.name} (${decode(currency.symbol)})`,
				value: currency.code,
			})),
		[allCurrencies]
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
			<Label nativeID="currency">{label}</Label>
			<Popover>
				<PopoverTrigger asChild>
					<Button variant="outline">
						<ButtonText>{displayLabel}</ButtonText>
					</Button>
				</PopoverTrigger>
				<PopoverContent className="p-0">
					<Command>
						<CommandInput placeholder={t('Search Currencies', { _tags: 'core' })} />
						<CommandEmpty>{t('No currency found', { _tags: 'core' })}</CommandEmpty>
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

/**
 *
 */
export const CurrencySelect = (props) => {
	return (
		<CurrenciesProvider>
			<_CurrencySelect {...props} />
		</CurrenciesProvider>
	);
};
