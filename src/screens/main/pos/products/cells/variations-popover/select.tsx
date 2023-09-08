import * as React from 'react';

import Select from '@wcpos/components/src/select';

import { useT } from '../../../../../../contexts/translations';
/**
 *
 */
const VariationSelect = ({ attribute, onSelect, selectedOption }) => {
	const t = useT();

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
