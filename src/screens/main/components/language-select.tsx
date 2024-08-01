import * as React from 'react';

import map from 'lodash/map';

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

import { useT } from '../../../contexts/translations';
import { useLocale } from '../../../hooks/use-locale';

/**
 *
 */
export const LanguageSelect = ({ label, value = 'en_US', onChange }) => {
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
		return selected ? selected.label : '';
	}, [options, value]);

	/**
	 *
	 */
	return (
		<VStack>
			<Label nativeID="language">{label}</Label>
			<Popover>
				<PopoverTrigger asChild>
					<Button variant="outline">
						<ButtonText>{displayLabel}</ButtonText>
					</Button>
				</PopoverTrigger>
				<PopoverContent className="p-0">
					<Command>
						<CommandInput placeholder={t('Search Languages', { _tags: 'core' })} />
						<CommandEmpty>{t('No language found', { _tags: 'core' })}</CommandEmpty>
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
