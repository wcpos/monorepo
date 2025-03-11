import * as React from 'react';

import { Input } from '@wcpos/components/input';

import { useNumberFormat, NumberFormatOptions } from '../hooks/use-number-format';

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
}

const NumberInputBase = ({ ...props }, ref) => {
	return <Input ref={ref} {...props} type="decimal" />;
};

export const NumberInput = React.forwardRef(NumberInputBase);
