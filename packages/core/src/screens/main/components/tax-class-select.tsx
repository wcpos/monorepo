import * as React from 'react';

import { OptionSelect } from '@wcpos/components/select';
import type { SelectSingleRootProps } from '@wcpos/components/select';
import { useDocField } from '@wcpos/query';

import { useT } from '../../../contexts/translations';
import { useExtraData } from '../contexts/extra-data';
import { INHERIT_TAX_CLASS } from '../hooks/tax-class';

interface Props extends SelectSingleRootProps {
	/**
	 * Offer WooCommerce's 'inherit' sentinel — "based on the cart items" — alongside the
	 * server's tax classes. It is not a class, so it is not in the server's list, and a
	 * select that omits it cannot render a store whose shipping tax class is set to it
	 * (the default for a new store): the field just reads blank. Only the shipping tax
	 * class setting owns the sentinel, so only that one opts in.
	 */
	includeInherit?: boolean;
}

/**
 *
 */
export function TaxClassSelect({ value, onValueChange, includeInherit, ...props }: Props) {
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
		const classOptions = ((taxClasses || []) as { name: string; slug: string }[]).map(
			(taxClass: { name: string; slug: string }) => ({
				label: taxClass.name,
				value: taxClass.slug,
			})
		);

		return includeInherit
			? [
					{ label: t('settings.shipping_tax_class_inherit'), value: INHERIT_TAX_CLASS },
					...classOptions,
				]
			: classOptions;
	}, [includeInherit, t, taxClasses]);

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
