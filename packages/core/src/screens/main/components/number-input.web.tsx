import * as React from 'react';

import toNumber from 'lodash/toNumber';
import { useObservableEagerState } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { cn } from '@wcpos/components/lib/utils';
import { Numpad } from '@wcpos/components/numpad';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/popover';
import { VStack } from '@wcpos/components/vstack';

import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { NumberFormatOptions, useNumberFormat } from '../hooks/use-number-format';

export interface NumberInputProps {
	/**  */
	value?: number | string;

	/**  */
	onChangeText: (value: number) => void;

	/**  */
	disabled?: boolean;

	/**  */
	discounts?: number[];

	/**  */
	placement?: 'top' | 'bottom' | 'left' | 'right';

	/**  */
	className?: string;

	/**  */
	formatOptions?: NumberFormatOptions;

	/**  */
	testID?: string;
}

/**
 * @FIXME - when the settings change, the button display does not change
 */
export const NumberInput = ({
	onChangeText,
	disabled = false,
	discounts,
	placement = 'bottom',
	className,
	formatOptions,
	testID,
	...props
}: NumberInputProps) => {
	const { store } = useAppState();
	const decimalSeparator = useObservableEagerState(store.price_decimal_sep$);
	const t = useT();
	const triggerRef = React.useRef(null);
	const numpadRef = React.useRef(null);
	const { format } = useNumberFormat(formatOptions);
	const { format: formatDisplay } = useNumberFormat({
		fixedDecimalScale: false,
		decimalScale: 6,
	});

	/**
	 *
	 */
	const value = props.value ? toNumber(props.value) : '';

	/**
	 * Handle change
	 */
	const handleChange = React.useCallback(
		(newValue: number) => {
			onChangeText?.(newValue);
			if (triggerRef.current) {
				triggerRef.current.close();
			}
		},
		[onChangeText]
	);

	/**
	 * Handle submit
	 */
	const handleSubmit = React.useCallback(() => {
		if (numpadRef.current) {
			const newValue = numpadRef.current.getValue();
			handleChange(newValue);
		}
	}, [handleChange]);

	/**
	 * NOTE: normally a button would truncate the text if there is not enough space, but
	 * this could cause a problem with prices, what if the price is 100 and the button
	 * only shows 10? So we need to make sure the button is wide enough to show the price.
	 */
	return (
		<Popover>
			<PopoverTrigger ref={triggerRef} asChild>
				<Button
					testID={testID}
					variant="outline"
					disabled={disabled}
					className={cn('min-w-10 items-start', className)}
				>
					<ButtonText>{value !== '' ? format(value) : ''}</ButtonText>
				</Button>
			</PopoverTrigger>
			<PopoverContent side={placement} className="w-auto p-2">
				<VStack className="gap-1">
					<Numpad
						ref={numpadRef}
						initialValue={toNumber(value)}
						onChangeText={handleChange}
						decimalSeparator={decimalSeparator}
						discounts={discounts}
						formatDisplay={(value) => formatDisplay(value)}
					/>
					<HStack className="justify-end">
						<Button testID="numpad-done-button" onPress={handleSubmit}>
							{t('common.done')}
						</Button>
					</HStack>
				</VStack>
			</PopoverContent>
		</Popover>
	);
};
