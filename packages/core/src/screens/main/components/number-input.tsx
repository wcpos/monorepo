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

export const NumberInput = ({ ...props }: React.ComponentProps<typeof Input>) => {
	return <Input {...props} type="decimal" />;
};
