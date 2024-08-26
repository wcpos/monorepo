import * as React from 'react';

import { ControllerRenderProps, FieldValues } from 'react-hook-form';

import { cn } from '@wcpos/components/src/lib/utils';
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
export const ProductStatusSelect = (props) => {
	const [selectTriggerWidth, setSelectTriggerWidth] = React.useState(0);
	const t = useT();

	/**
	 * Options
	 */
	const options = React.useMemo(
		() => [
			{ label: t('Draft', { _tags: 'core' }), value: 'draft' },
			{ label: t('Pending', { _tags: 'core' }), value: 'pending' },
			{ label: t('Private', { _tags: 'core' }), value: 'private' },
			{ label: t('Publish', { _tags: 'core' }), value: 'publish' },
		],
		[t]
	);

	/**
	 *
	 */
	return (
		<Select {...props}>
			<SelectTrigger
				onLayout={(ev) => {
					setSelectTriggerWidth(ev.nativeEvent.layout.width);
				}}
			>
				<SelectValue
					className={cn(
						'text-sm native:text-lg',
						props.value ? 'text-foreground' : 'text-muted-foreground'
					)}
					placeholder={t('Select Status', { _tags: 'core' })}
				/>
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
