import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { ControllerRenderProps, FieldValues } from 'react-hook-form';

import { FormSelect } from '@wcpos/components/src/form';
import { cn } from '@wcpos/components/src/lib/utils';
import {
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/components/src/select';
import { Text } from '@wcpos/components/src/text';

import { useT } from '../../../contexts/translations';
import { useExtraData } from '../contexts/extra-data';

interface Props<TFieldValues extends FieldValues> {
	field: ControllerRenderProps<TFieldValues, any>;
	label?: string;
}

/**
 *
 */
export const TaxClassSelect = <TFieldValues extends FieldValues>({
	field,
	label,
}: Props<TFieldValues>) => {
	const [selectTriggerWidth, setSelectTriggerWidth] = React.useState(0);
	const t = useT();
	const { extraData } = useExtraData();
	const taxClasses = useObservableEagerState(extraData.taxClasses$);

	/**
	 * @NOTE: Because the WC REST API is trash, it won't accept 'standard' as a tax class,
	 * so we need to send an empty string instead.
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
	return (
		<FormSelect label={label ? label : t('Tax Class', { _tags: 'core' })} {...field}>
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
					placeholder={t('Select Tax Class', { _tags: 'core' })}
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
