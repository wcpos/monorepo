import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import {
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Select,
} from '@wcpos/components/src/select';
import { Text } from '@wcpos/components/src/text';

import { useT } from '../../../contexts/translations';
import { useExtraData } from '../contexts/extra-data';

/**
 *
 */
export const ShippingMethodSelect = React.forwardRef<
	React.ElementRef<typeof Select>,
	React.ComponentPropsWithoutRef<typeof Select>
>(({ onValueChange, value, ...props }, ref) => {
	const { extraData } = useExtraData();
	const shippingMethods = useObservableEagerState(extraData.shippingMethods$);
	const [selectTriggerWidth, setSelectTriggerWidth] = React.useState(0);
	const t = useT();

	/**
	 *
	 */
	const options = React.useMemo(() => {
		return (shippingMethods || []).map((method) => ({
			label: method.title,
			value: method.id,
		}));
	}, [shippingMethods]);

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
				<SelectValue placeholder={t('Select Shipping Method', { _tags: 'core' })} />
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
