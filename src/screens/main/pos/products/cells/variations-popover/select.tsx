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
			/**
			 * FIXME: this might cause problems with z stacking in popovers?
			 * I need to redo the Portal component to properly handle click outside
			 */
			withinPortal={false}
		/>
	);
};

export default VariationSelect;
