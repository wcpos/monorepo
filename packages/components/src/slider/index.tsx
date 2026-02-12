import * as React from 'react';

import * as SliderPrimitive from '@rn-primitives/slider';

import { cn } from '../lib/utils';

interface SliderProps {
	value: number;
	onValueChange?: (value: number) => void;
	min?: number;
	max?: number;
	step?: number;
	disabled?: boolean;
	className?: string;
}

function Slider({
	value,
	onValueChange,
	min = 0,
	max = 100,
	step = 1,
	disabled,
	className,
}: SliderProps) {
	const handleValueChange = React.useCallback(
		(values: number[]) => {
			onValueChange?.(values[0]);
		},
		[onValueChange]
	);

	return (
		<SliderPrimitive.Root
			value={value}
			onValueChange={handleValueChange}
			min={min}
			max={max}
			step={step}
			disabled={disabled}
			className={cn('flex-row items-center', className)}
		>
			<SliderPrimitive.Track className="bg-muted relative h-2 w-full rounded-full">
				<SliderPrimitive.Range className="bg-primary absolute h-full rounded-full" />
			</SliderPrimitive.Track>
			<SliderPrimitive.Thumb className="bg-background border-primary block h-5 w-5 rounded-full border-2 shadow" />
		</SliderPrimitive.Root>
	);
}

export { Slider };
export type { SliderProps };
