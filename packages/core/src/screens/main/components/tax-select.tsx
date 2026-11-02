import * as React from 'react';

import { OptionSelect } from '@wcpos/components/select';

import { useTaxClassOptions } from './tax-class-select';
import { useT } from '../../../contexts/translations';

interface TaxValue {
	tax_status: 'taxable' | 'none';
	tax_class: string;
}

interface TaxSelectProps {
	status: TaxValue['tax_status'];
	taxClass: string;
	onChange: (value: TaxValue) => void;
	/** A variation's 'parent' sentinel as a class option ("Same as parent"); it stays taxable. */
	includeParent?: boolean;
	testID?: string;
	'aria-labelledby'?: string;
}

/**
 * Option values live in two namespaces so a store's class whose slug is `none` (or anything
 * else) can never collide with the Not taxable option: `status:none` and `class:<slug>`.
 */
const NOT_TAXABLE = 'status:none';
const classValue = (slug: string) => `class:${slug}`;
const classSlug = (value: string) => value.slice('class:'.length);

/**
 * Tax status and tax class as ONE fact, "Tax" (property rows rule 4): Not taxable, then the
 * store's classes. Not taxable keeps the class as it is, as Woo does; a class makes it taxable.
 * The class keeps the app's 'standard' spelling; `taxClassToWire` maps it on the way out.
 */
export function TaxSelect({
	status,
	taxClass,
	onChange,
	includeParent,
	testID,
	...props
}: TaxSelectProps) {
	const t = useT();
	const classes = useTaxClassOptions(includeParent);
	const options = React.useMemo(
		() => [
			{ label: t('common.not_taxable'), value: NOT_TAXABLE },
			...classes.map((option) => ({ ...option, value: classValue(option.value) })),
		],
		[classes, t]
	);
	return (
		<OptionSelect
			options={options}
			value={status === 'none' ? NOT_TAXABLE : classValue(taxClass)}
			onChange={(next) =>
				onChange(
					!next || next === NOT_TAXABLE
						? { tax_status: 'none', tax_class: taxClass }
						: { tax_status: 'taxable', tax_class: classSlug(next) }
				)
			}
			placeholder={t('common.select_tax_class')}
			fallbackLabel=""
			matchWidth
			triggerTestID={testID}
			{...props}
		/>
	);
}
