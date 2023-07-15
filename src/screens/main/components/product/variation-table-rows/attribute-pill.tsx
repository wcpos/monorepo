import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';

import Pill from '@wcpos/components/src/pill';
import Select from '@wcpos/components/src/select';

import { t } from '../../../../../lib/translations';

const VariationAttributePill = ({ attribute, onSelect, ...props }) => {
	const [openSelect, setOpenSelect] = React.useState(false);
	const [selected, setSelected] = React.useState(props.selected);

	/**
	 * @TODO - this works, but it's ugly as hell, need to choose controlled or uncontrolled
	 */
	React.useEffect(() => {
		setSelected(props.selected);
	}, [props.selected]);

	/**
	 *
	 */
	const handleSelect = React.useCallback(
		(option) => {
			setSelected(option);
			onSelect && onSelect({ name: attribute.name, option });
		},
		[attribute.name, onSelect]
	);

	/**
	 *
	 */
	const handleRemove = React.useCallback(() => {
		setSelected(null);
		setOpenSelect(false);
		onSelect && onSelect({ name: attribute.name, option: null });
	}, [attribute.name, onSelect]);

	/**
	 *
	 */
	if (selected) {
		return (
			<Pill size="small" removable onRemove={handleRemove} icon="check">
				{`${attribute.name}: ${selected}`}
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
