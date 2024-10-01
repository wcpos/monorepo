import * as React from 'react';

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

/**
 *
 */
export const CurrencyPositionSelect = React.forwardRef<
	React.ElementRef<typeof Select>,
	React.ComponentPropsWithoutRef<typeof Select>
>(({ onValueChange, value, ...props }, ref) => {
	const [selectTriggerWidth, setSelectTriggerWidth] = React.useState(0);
	const t = useT();

	/**
	 *
	 */
	const options = React.useMemo(() => {
		return [
			{ value: 'left', label: t('Left', { _tags: 'core' }) },
			{ value: 'right', label: t('Right', { _tags: 'core' }) },
			{ value: 'left_space', label: t('Left with space', { _tags: 'core' }) },
			{ value: 'right_space', label: t('Right with space', { _tags: 'core' }) },
		];
	}, [t]);

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
				<SelectValue placeholder={t('Select a currency position', { _tags: 'core' })} />
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
