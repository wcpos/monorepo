import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/components/src/select';
import { Text } from '@wcpos/components/src/text';

import { useT } from '../../../contexts/translations';
import { useExtraData } from '../contexts/extra-data';

/**
 *
 */
export const TaxClassSelect = React.forwardRef<
	React.ElementRef<typeof Select>,
	React.ComponentPropsWithoutRef<typeof Select>
>(({ onValueChange, value, ...props }, ref) => {
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
		return (taxClasses || []).map((taxClass) => ({
			label: taxClass.name,
			value: taxClass.slug,
		}));
	}, [taxClasses]);

	/**
	 *
	 */
	const label = options.find((option) => option.value === value?.value)?.label;

	/**
	 *
	 */
	return (
		<Select ref={ref} value={{ ...value, label }} onValueChange={onValueChange}>
			<SelectTrigger
				onLayout={(ev) => {
					setSelectTriggerWidth(ev.nativeEvent.layout.width);
				}}
			>
				<SelectValue placeholder={t('Select Tax Class', { _tags: 'core' })} />
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
});
