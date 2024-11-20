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

import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';

/**
 *
 */
export const ThousandsStyleSelect = React.forwardRef<
	React.ElementRef<typeof Select>,
	React.ComponentPropsWithoutRef<typeof Select>
>(({ onValueChange, value, ...props }, ref) => {
	const [selectTriggerWidth, setSelectTriggerWidth] = React.useState(0);
	const t = useT();
	const { store } = useAppState();
	const price_thousand_sep = useObservableEagerState(store.price_thousand_sep$);

	/**
	 * Use price_thousand_sep from store for formatting examples
	 */
	const options = React.useMemo(
		() => [
			{
				value: 'thousand',
				label: `123${price_thousand_sep}456${price_thousand_sep}789`,
			},
			{
				value: 'lakh',
				label: `12${price_thousand_sep}34${price_thousand_sep}56${price_thousand_sep}789`,
			},
			{ value: 'wan', label: `1${price_thousand_sep}2345${price_thousand_sep}6789` },
		],
		[price_thousand_sep]
	);

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
				<SelectValue placeholder={t('Select thousands style', { _tags: 'core' })} />
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
