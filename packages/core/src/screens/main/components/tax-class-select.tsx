import * as React from 'react';

import { OptionSelect } from '@wcpos/components/select';
import type { SelectSingleRootProps } from '@wcpos/components/select';
import { useDocField } from '@wcpos/query';

import { useT } from '../../../contexts/translations';
import { useExtraData } from '../contexts/extra-data';
import { PARENT_TAX_CLASS } from '../hooks/tax-class';

interface Props extends SelectSingleRootProps {
	/**
	 * Offer WooCommerce's 'parent' sentinel — a variation's "same as parent" — alongside the
	 * server's tax classes. It is not a class, so it is not in the server's list, and a
	 * select that omits it renders a variation set to it (Woo's default for a new one) as
	 * the empty placeholder. Only the variation form owns the sentinel, so only it opts in.
	 */
	includeParent?: boolean;
}

/**
 * The store's tax classes as select options, with the variation's 'parent' sentinel when asked.
 *
 * @NOTE: Because the WC REST API is trash, it won't accept 'standard' as a tax class,
 * so we need to send an empty string instead.
 * BUT! A select item can't have an empty string as a value, so we need to use 'standard'.
 * It's a mess.
 */
export function useTaxClassOptions(includeParent?: boolean) {
	const t = useT();
	const { extraData } = useExtraData();
	const taxClasses = useDocField(extraData, (value) => value.taxClasses);
	return React.useMemo(() => {
		const classOptions = ((taxClasses || []) as { name: string; slug: string }[]).map(
			(taxClass: { name: string; slug: string }) => ({
				label: taxClass.name,
				value: taxClass.slug,
			})
		);

		return includeParent
			? [{ label: t('common.tax_class_same_as_parent'), value: PARENT_TAX_CLASS }, ...classOptions]
			: classOptions;
	}, [includeParent, t, taxClasses]);
}

/**
 *
 */
export function TaxClassSelect({ value, onValueChange, includeParent, ...props }: Props) {
	const t = useT();
	const options = useTaxClassOptions(includeParent);

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
