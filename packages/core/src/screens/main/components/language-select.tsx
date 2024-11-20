import * as React from 'react';

import map from 'lodash/map';

import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
	ComboboxSearch,
	ComboboxTrigger,
	ComboboxValue,
} from '@wcpos/components/src/combobox';

import { useT } from '../../../contexts/translations';
import { useLocale } from '../../../hooks/use-locale';

/**
 *
 */
export const LanguageSelect = React.forwardRef<
	React.ElementRef<typeof Combobox>,
	React.ComponentPropsWithoutRef<typeof Combobox>
>(({ value, onValueChange, ...props }, ref) => {
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
	const label = React.useMemo(() => {
		const selected = options.find((option) => option.value === value?.value);
		return selected?.label;
	}, [options, value]);

	/**
	 *
	 */
	return (
		<Combobox ref={ref} value={{ ...value, label }} onValueChange={onValueChange}>
			<ComboboxTrigger>
				<ComboboxValue placeholder={t('Select Language', { _tags: 'core' })} />
			</ComboboxTrigger>
			<ComboboxContent>
				<ComboboxSearch>
					<ComboboxInput placeholder={t('Search Languages', { _tags: 'core' })} />
					<ComboboxEmpty>{t('No language found', { _tags: 'core' })}</ComboboxEmpty>
					<ComboboxList>
						{options.map((option) => (
							<ComboboxItem key={option.value} value={option.value} label={option.label} />
						))}
					</ComboboxList>
				</ComboboxSearch>
			</ComboboxContent>
		</Combobox>
	);
});
