import * as React from 'react';

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

/**
 *
 */
export const CurrencyPositionSelect = ({
	value,
	...props
}: React.ComponentProps<typeof Select>) => {
	const [selectTriggerWidth, setSelectTriggerWidth] = React.useState(0);
	const t = useT();

	/**
	 *
	 */
	const options = React.useMemo(() => {
		return [
			{ value: 'left', label: t('Left') },
			{ value: 'right', label: t('Right') },
			{ value: 'left_space', label: t('Left with space') },
			{ value: 'right_space', label: t('Right with space') },
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
		<Select value={{ ...value, label }} {...props}>
			<SelectTrigger
				onLayout={(ev) => {
					setSelectTriggerWidth(ev.nativeEvent.layout.width);
				}}
			>
				<SelectValue placeholder={t('Select a currency position')} />
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
};
