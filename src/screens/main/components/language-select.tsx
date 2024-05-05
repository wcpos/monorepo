import * as React from 'react';

import map from 'lodash/map';

import { ComboboxWithLabel } from '@wcpos/components/src/combobox';

import { useLocale } from '../../../hooks/use-locale';

/**
 *
 */
export const LanguageSelect = ({ label, value = 'en_US', onChange }) => {
	const { locales } = useLocale();

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

	return <ComboboxWithLabel label={label} options={options} value={value} onChange={onChange} />;
};
