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
export const ThousandsStyleSelect = React.forwardRef<React.ElementRef<typeof Select>, any>(
	({ onValueChange, value, ...props }, ref) => {
		const [selectTriggerWidth, setSelectTriggerWidth] = React.useState(0);
		const t = useT();

		/**
		 *
		 */
		const options = React.useMemo(
			() => [
				{
					value: 'thousand',
					label: t('123,456,789', { _tags: 'core' }),
				},
				{ value: 'lakh', label: t('12,34,56,789', { _tags: 'core' }) },
				{ value: 'wan', label: t('1,2345,6789', { _tags: 'core' }) },
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
	}
);
