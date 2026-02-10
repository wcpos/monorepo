import * as React from 'react';

import map from 'lodash/map';

import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxItemText,
	ComboboxList,
	ComboboxTrigger,
	ComboboxValue,
} from '@wcpos/components/combobox';

import { useT } from '../../../contexts/translations';
import { useLocale } from '../../../hooks/use-locale';

/**
 *
 */
export function LanguageSelect({ value, ...props }: React.ComponentProps<typeof Combobox>) {
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
		<Combobox value={value ? { ...value, label: label ?? '' } : undefined} {...props}>
			<ComboboxTrigger testID="language-select-trigger">
				<ComboboxValue placeholder={t('common.select_language')} />
			</ComboboxTrigger>
			<ComboboxContent testID="language-combobox-content">
				<ComboboxInput testID="language-search-input" placeholder={t('common.search_languages')} />
				<ComboboxList
					data={options}
					renderItem={({ item }) => (
						<ComboboxItem value={String(item.value)} label={item.label} item={item}>
							<ComboboxItemText />
						</ComboboxItem>
					)}
					estimatedItemSize={44}
					ListEmptyComponent={<ComboboxEmpty>{t('common.no_language_found')}</ComboboxEmpty>}
				/>
			</ComboboxContent>
		</Combobox>
	);
}
