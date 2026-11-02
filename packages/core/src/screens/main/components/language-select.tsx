import * as React from 'react';

import map from 'lodash/map';

import { OptionsCombobox } from '@wcpos/components/combobox';
import type { OptionSelectProps } from '@wcpos/components/select';

import { useT } from '../../../contexts/translations';
import { useLocale } from '../../../hooks/use-locale';

/**
 *
 */
export function LanguageSelect(props: Omit<OptionSelectProps, 'options' | 'placeholder'>) {
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

	return (
		<OptionsCombobox
			options={options}
			placeholder={t('common.select_language')}
			searchPlaceholder={t('common.search_languages')}
			emptyLabel={t('common.no_language_found')}
			triggerTestID="language-select"
			{...props}
		/>
	);
}
