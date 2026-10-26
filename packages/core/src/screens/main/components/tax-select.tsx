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
	testID?: string;
	'aria-labelledby'?: string;
}

/** Not a tax class: the option that writes `tax_status: 'none'`. */
const NOT_TAXABLE = 'none';

/**
 * Tax status and tax class as ONE fact, "Tax" (property rows rule 4): Not taxable, then the
 * store's classes. Not taxable keeps the class as it is, as Woo does; a class makes it taxable.
 * The class keeps the app's 'standard' spelling; `taxClassToWire` maps it on the way out.
 */
export function TaxSelect({ status, taxClass, onChange, testID, ...props }: TaxSelectProps) {
	const t = useT();
	const classes = useTaxClassOptions();
	const options = React.useMemo(
		() => [{ label: t('common.not_taxable'), value: NOT_TAXABLE }, ...classes],
		[classes, t]
	);
	return (
		<OptionSelect
			options={options}
			value={status === 'none' ? NOT_TAXABLE : taxClass}
			onChange={(next) =>
				onChange(
					next === NOT_TAXABLE
						? { tax_status: 'none', tax_class: taxClass }
						: { tax_status: 'taxable', tax_class: next ?? taxClass }
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
