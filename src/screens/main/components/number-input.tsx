import * as React from 'react';

import toNumber from 'lodash/toNumber';
import { useObservableEagerState } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/components/src/button';
import { HStack } from '@wcpos/components/src/hstack';
import { cn } from '@wcpos/components/src/lib/utils';
import { Numpad } from '@wcpos/components/src/numpad';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/src/popover';
import { VStack } from '@wcpos/components/src/vstack';

import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { useNumberFormat, NumberFormatOptions } from '../hooks/use-number-format';

export interface NumberInputProps {
	/**  */
	value?: number | string;

	/**  */
	onChangeText: (value: number) => void;

	/**  */
	disabled?: boolean;

	/**  */
	showDiscounts?: boolean;

	/**  */
	placement?: 'top' | 'bottom' | 'left' | 'right';

	/**  */
	className?: string;

	/**  */
	formatOptions?: NumberFormatOptions;
}

/**
 *
 */
export const NumberInput = React.forwardRef<React.ElementRef<typeof Numpad>, NumberInputProps>(
	(
		{
			onChangeText,
			disabled = false,
			showDiscounts,
			placement = 'bottom',
			className,
			formatOptions,
			...props
		},
		ref
	) => {
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
		 *
		 */
		return (
			<Popover>
				<PopoverTrigger ref={triggerRef} asChild>
					<Button variant="outline" disabled={disabled} className={cn('items-start', className)}>
						<ButtonText numberOfLines={1}>{value !== '' ? format(value) : ''}</ButtonText>
					</Button>
				</PopoverTrigger>
				<PopoverContent side={placement} className="p-2 w-auto">
					<VStack className="gap-1">
						<Numpad
							ref={numpadRef}
							initialValue={toNumber(value)}
							onChangeText={handleChange}
							decimalSeparator={decimalSeparator}
							discounts={false}
							formatDisplay={(value) => formatDisplay(value)}
						/>
						<HStack className="justify-end">
							<Button onPress={handleSubmit}>
								<ButtonText>{t('Done', { _tags: 'core' })}</ButtonText>
							</Button>
						</HStack>
					</VStack>
				</PopoverContent>
			</Popover>
		);
	}
);
