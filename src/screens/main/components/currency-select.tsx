import * as React from 'react';

import { decode } from 'html-entities';

import {
	Command,
	CommandInput,
	CommandEmpty,
	CommandList,
	CommandItem,
	CommandButton,
} from '@wcpos/components/src/command';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/src/popover';
import { Select } from '@wcpos/components/src/select';
import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';

import useCurrencies, { CurrenciesProvider } from '../../../contexts/currencies';
import { useT } from '../../../contexts/translations';

interface CurrencySelectProps {
	value?: string;
	onChange?: (value: string) => void;
	[key: string]: any;
}

/**
 *
 */
const _CurrencySelect = React.forwardRef<React.ElementRef<typeof Select>, CurrencySelectProps>(
	({ onChange, ...props }, ref) => {
		const allCurrencies = useCurrencies();
		const t = useT();

		/**
		 * React hook form passes in value as an object, but our data is usually a string
		 * so we need to convert it.
		 */
		const value = React.useMemo(() => {
			if (typeof props.value === 'object' && props.value !== null) {
				return props.value.value;
			}
			return props.value;
		}, [props.value]);

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
				<Popover>
					<PopoverTrigger asChild>
						<CommandButton>
							<Text>{displayLabel}</Text>
						</CommandButton>
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
	}
);

/**
 *
 */
export const CurrencySelect = React.forwardRef<
	React.ElementRef<typeof Select>,
	CurrencySelectProps
>((props, ref) => {
	return (
		<CurrenciesProvider>
			<_CurrencySelect ref={ref} {...props} />
		</CurrenciesProvider>
	);
});
