import * as React from 'react';

import { RadioGroup, RadioGroupOption } from '@wcpos/components/radio-group';

import { useT } from '../../../contexts/translations';

type TaxRadioGroupProps = React.ComponentProps<typeof RadioGroup> & { name: string };

function TaxRadioGroup({
	options,
	...props
}: TaxRadioGroupProps & { options: { label: string; value: string }[] }) {
	return (
		<RadioGroup {...props}>
			{options.map((option) => (
				<RadioGroupOption key={option.value} value={option.value} label={option.label} />
			))}
		</RadioGroup>
	);
}

export function InclExclRadioGroup(props: TaxRadioGroupProps) {
	const t = useT();
	return (
		<TaxRadioGroup
			options={[
				{ label: t('common.including_tax'), value: 'incl' },
				{ label: t('common.excluding_tax'), value: 'excl' },
			]}
			{...props}
		/>
	);
}

export function TaxDisplayRadioGroup(props: TaxRadioGroupProps) {
	const t = useT();
	return (
		<TaxRadioGroup
			options={[
				{ label: t('common.as_a_single_total'), value: 'single' },
				{ label: t('common.itemized'), value: 'itemized' },
			]}
			{...props}
		/>
	);
}

export function TaxStatusRadioGroup(props: TaxRadioGroupProps) {
	const t = useT();
	return (
		<TaxRadioGroup
			options={[
				{ label: t('common.taxable'), value: 'taxable' },
				{ label: t('common.none'), value: 'none' },
			]}
			{...props}
		/>
	);
}
