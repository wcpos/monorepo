import * as React from 'react';

import {
	Combobox,
	ComboboxTrigger,
	ComboboxContent,
	ComboboxValue,
} from '@wcpos/components/src/combobox';

import { TagSearch } from './search';
import { useT } from '../../../../../contexts/translations';

/**
 *
 */
export const TagSelect = ({ onValueChange }) => {
	const t = useT();

	/**
	 *
	 */
	return (
		<Combobox onValueChange={onValueChange}>
			<ComboboxTrigger>
				<ComboboxValue placeholder={t('Select Tag', { _tags: 'core' })} />
			</ComboboxTrigger>
			<ComboboxContent>
				<TagSearch />
			</ComboboxContent>
		</Combobox>
	);
};
