import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';

import Pill from '@wcpos/components/src/pill';
import Select from '@wcpos/components/src/select';

import { t } from '../../../../../lib/translations';
import useVariations from '../../../contexts/variations';

const VariationAttributePill = ({ attribute }) => {
	const [openSelect, setOpenSelect] = React.useState(false);
	const { setQuery, query$ } = useVariations();
	const query = useObservableState(query$, query$.getValue());
	const allMatch = get(query, 'selector.attributes.$allMatch', []);
	const thisMatch = allMatch.find((match) => match.name === attribute.name);

	/**
	 *
	 */
	const handleSelect = React.useCallback(
		(option) => {
			const newAllMatch = allMatch.filter((match) => match.name !== attribute.name);
			newAllMatch.push({
				name: attribute.name,
				option,
			});
			setQuery('selector.attributes.$allMatch', newAllMatch);
		},
		[allMatch, attribute.name, setQuery]
	);

	/**
	 *
	 */
	const handleRemove = React.useCallback(() => {
		const newAllMatch = allMatch.filter((match) => match.name !== attribute.name);
		setQuery('selector.attributes.$allMatch', newAllMatch);
		setOpenSelect(false);
	}, [allMatch, attribute.name, setQuery]);

	/**
	 *
	 */
	if (thisMatch) {
		return (
			<Pill size="small" removable onRemove={handleRemove} icon="check">
				{`${thisMatch.name}: ${thisMatch.option}`}
			</Pill>
		);
	}

	/**
	 *
	 */
	return openSelect ? (
		<Select
			size="small"
			options={attribute.options}
			onChange={handleSelect}
			placeholder={t('Select {attribute}', { _tags: 'core', attribute: attribute.name })}
			style={{ minWidth: 150 }}
			opened
		/>
	) : (
		<Pill icon="check" size="small" color="lightGrey" onPress={() => setOpenSelect(true)}>
			{t('Select {attribute}', { _tags: 'core', attribute: attribute.name })}
		</Pill>
	);
};

export default VariationAttributePill;
