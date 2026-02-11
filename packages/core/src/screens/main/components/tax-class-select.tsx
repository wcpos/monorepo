import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/components/select';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../contexts/translations';
import { useExtraData } from '../contexts/extra-data';

/**
 *
 */
export function TaxClassSelect({ value, ...props }: React.ComponentProps<typeof Select>) {
	const [selectTriggerWidth, setSelectTriggerWidth] = React.useState(0);
	const t = useT();
	const { extraData } = useExtraData();
	const taxClasses = useObservableEagerState(extraData.taxClasses$);

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
	const label = options.find(
		(option: { value: string; label: string }) => option.value === value?.value
	)?.label;

	/**
	 *
	 */
	return (
		<Select value={value ? { ...value, label: label ?? '' } : undefined} {...props}>
			<SelectTrigger
				onLayout={(ev) => {
					setSelectTriggerWidth(ev.nativeEvent.layout.width);
				}}
			>
				<SelectValue placeholder={t('common.select_tax_class')} />
			</SelectTrigger>
			<SelectContent style={{ width: selectTriggerWidth }}>
				<SelectGroup>
					{options.map((option) => (
						<SelectItem key={option.value} label={option.label} value={option.value}>
							<Text>{option.label}</Text>
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	);
}
