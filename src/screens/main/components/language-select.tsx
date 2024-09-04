import * as React from 'react';

import map from 'lodash/map';

import { Button, ButtonText } from '@wcpos/components/src/button';
import {
	Command,
	CommandInput,
	CommandEmpty,
	CommandList,
	CommandItem,
} from '@wcpos/components/src/command';
import { Popover, PopoverTrigger, PopoverContent } from '@wcpos/components/src/popover';

import { useT } from '../../../contexts/translations';
import { useLocale } from '../../../hooks/use-locale';

/**
 *
 */
export const LanguageSelect = React.forwardRef<React.ElementRef<typeof Command>, any>(
	({ onValueChange, ...props }, ref) => {
		const value = props.value?.value ? props.value.value : props.value;
		const { locales } = useLocale();
		const t = useT();

		/**
		 *
		 */
		const options = React.useMemo(
			() =>
				map(locales, (language) => {
					let label = language.name;
					if (language?.nativeName && language.name !== language.nativeName) {
						label += ` (${language.nativeName})`;
					}
					return {
						label,
						value: language.locale,
					};
				}),
			[locales]
		);

		/**
		 *
		 */
		const displayLabel = React.useMemo(() => {
			const selected = options.find((option) => option.value === value);
			return selected ? selected.label : t('Select Language', { _tags: 'core' });
		}, [options, t, value]);

		/**
		 *
		 */
		return (
			<Popover>
				<PopoverTrigger asChild>
					<Button variant="outline" className="items-start">
						<ButtonText>{displayLabel}</ButtonText>
					</Button>
				</PopoverTrigger>
				<PopoverContent className="p-0">
					<Command ref={ref}>
						<CommandInput placeholder={t('Search Languages', { _tags: 'core' })} />
						<CommandEmpty>{t('No language found', { _tags: 'core' })}</CommandEmpty>
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
	}
);
