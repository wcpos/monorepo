import * as React from 'react';

import { OptionSelect } from '@wcpos/components/select';
import type { SelectSingleRootProps } from '@wcpos/components/select';
import { useDocField } from '@wcpos/query';

import { useT } from '../../../contexts/translations';
import { useExtraData } from '../contexts/extra-data';

/**
 *
 */
export function TaxClassSelect({ value, onValueChange, ...props }: SelectSingleRootProps) {
	const t = useT();
	const { extraData } = useExtraData();
	const taxClasses = useDocField(extraData, (value) => value.taxClasses);

	/**
	 * @NOTE: Because the WC REST API is trash, it won't accept 'standard' as a tax class,
	 * so we need to send an empty string instead.
	 * BUT! A select item can't have an empty string as a value, so we need to use 'standard'.
	 * It's a mess.
	 */
	const options = React.useMemo(() => {
		return ((taxClasses || []) as { name: string; slug: string }[]).map(
			(taxClass: { name: string; slug: string }) => ({
				label: taxClass.name,
				value: taxClass.slug,
			})
		);
	}, [taxClasses]);

	/**
	 *
	 */
	return (
		<OptionSelect
			options={options}
			value={value?.value}
			onChange={(_nextValue, option) => onValueChange?.(option)}
			placeholder={t('common.select_tax_class')}
			fallbackLabel=""
			matchWidth
			{...props}
		/>
	);
}
