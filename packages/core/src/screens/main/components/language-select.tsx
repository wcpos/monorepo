import * as React from 'react';

import map from 'lodash/map';

import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	comboboxFilter,
	ComboboxInput,
	ComboboxList,
	ComboboxTrigger,
	ComboboxValue,
} from '@wcpos/components/combobox';

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
	const [searchTerm, setSearchTerm] = React.useState('');
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
	const filteredOptions = React.useMemo(() => {
		return comboboxFilter(options, searchTerm);
	}, [options, searchTerm]);

	/**
	 *
	 */
	return (
		<Combobox ref={ref} value={{ ...value, label }} onValueChange={onValueChange}>
			<ComboboxTrigger>
				<ComboboxValue placeholder={t('Select Language', { _tags: 'core' })} />
			</ComboboxTrigger>
			<ComboboxContent>
				<ComboboxInput
					value={searchTerm}
					onChangeText={setSearchTerm}
					placeholder={t('Search Languages', { _tags: 'core' })}
				/>
				<ComboboxList
					data={filteredOptions}
					ListEmptyComponent={
						<ComboboxEmpty>{t('No language found', { _tags: 'core' })}</ComboboxEmpty>
					}
				/>
			</ComboboxContent>
		</Combobox>
	);
});

LanguageSelect.displayName = 'LanguageSelect';
