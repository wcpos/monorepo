import * as React from 'react';

import Select from '@wcpos/components/src/select';

import { t } from '../../../../../../lib/translations';
/**
 *
 */
const VariationSelect = ({ attribute, onSelect, selectedOption }) => {
	/**
	 *
	 */
	return (
		<Select
			value={selectedOption}
			options={attribute.options}
			onChange={(option) => onSelect(attribute, option)}
			placeholder={t('Select an option', { _tags: 'core' })}
		/>
	);
};

export default VariationSelect;
