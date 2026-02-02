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

import { useT } from '../../../../contexts/translations';

/**
 *
 */
export const ProductStatusSelect = React.forwardRef<
	React.ElementRef<typeof Select>,
	React.ComponentPropsWithoutRef<typeof Select>
>(({ onValueChange, value, ...props }, ref) => {
	const [selectTriggerWidth, setSelectTriggerWidth] = React.useState(0);
	const t = useT();

	/**
	 * Options
	 */
	const options = React.useMemo(
		() => [
			{ label: t('Draft'), value: 'draft' },
			{ label: t('Pending'), value: 'pending' },
			{ label: t('Private'), value: 'private' },
			{ label: t('Publish'), value: 'publish' },
		],
		[t]
	);

	/**
	 *
	 */
	const label = options.find((option) => option.value === value?.value)?.label;

	/**
	 *
	 */
	return (
		<Select ref={ref} value={{ ...value, label }} {...props}>
			<SelectTrigger
				onLayout={(ev) => {
					setSelectTriggerWidth(ev.nativeEvent.layout.width);
				}}
			>
				<SelectValue placeholder={t('Select Status')} />
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
