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
import { Popover, PopoverTrigger, PopoverContent } from '@wcpos/tailwind/src/popover';

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
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="outline">
					<ButtonText>{value}</ButtonText>
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
	);
};
