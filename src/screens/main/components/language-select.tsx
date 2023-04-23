import * as React from 'react';

import map from 'lodash/map';

import { ComboboxWithLabel } from '@wcpos/components/src/combobox';

import useLanguages, { LanguagesProvider } from '../../../contexts/languages';

/**
 *
 */
const LanguageSelect = ({ label, value = 'en_US', onChange }) => {
	const allLanguages = useLanguages();
	const options = map(allLanguages, (language) => ({
		label: `${language.name}${
			language.name !== language.nativeName ? ` (${language.nativeName})` : ''
		}`,
		value: language.locale,
	}));

	return <ComboboxWithLabel label={label} options={options} value={value} onChange={onChange} />;
};

/**
 *
 */
const LanguageSelectWithProvider = (props) => {
	return (
		<LanguagesProvider>
			<LanguageSelect {...props} />
		</LanguagesProvider>
	);
};

export default LanguageSelectWithProvider;
