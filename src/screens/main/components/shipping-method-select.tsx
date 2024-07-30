import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { FormSelect } from '@wcpos/tailwind/src/form';
import { cn } from '@wcpos/tailwind/src/lib/utils';
import {
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/tailwind/src/select';
import { Text } from '@wcpos/tailwind/src/text';

import { useT } from '../../../contexts/translations';
import { useExtraData } from '../contexts/extra-data';

/**
 *
 */
export const ShippingMethodSelect = ({ field }) => {
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
	return (
		<FormSelect label={t('Shipping Method', { _tags: 'core' })} {...field}>
			<SelectTrigger
				onLayout={(ev) => {
					setSelectTriggerWidth(ev.nativeEvent.layout.width);
				}}
			>
				<SelectValue
					className={cn(
						'text-sm native:text-lg',
						field.value ? 'text-foreground' : 'text-muted-foreground'
					)}
					placeholder={t('Select Shipping Method', { _tags: 'core' })}
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
		</FormSelect>
	);
};
