import * as React from 'react';

import {
	Combobox,
	ComboboxTrigger,
	ComboboxContent,
	ComboboxValue,
} from '@wcpos/components/src/combobox';

import { CategorySearch } from './search';
import { useT } from '../../../../../contexts/translations';

/**
 *
 */
export const CategorySelect = ({ onValueChange }) => {
	const t = useT();

	/**
	 *
	 */
	return (
		<Combobox onValueChange={onValueChange}>
			<ComboboxTrigger>
				<ComboboxValue placeholder={t('Select Category', { _tags: 'core' })} />
			</ComboboxTrigger>
			<ComboboxContent>
				<CategorySearch />
			</ComboboxContent>
		</Combobox>
	);
};
