import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils';
import { TextClassContext } from '../text/context';

/** What a field holds reads in the foreground, its placeholder muted. */
const FIELD_TEXT = 'text-foreground placeholder:text-muted-foreground text-base';

/**
 * The closed face of every control: Input, Textarea, the pickers' triggers and the keypads'.
 * A TextInput cannot be wrapped, so this class string is the interface; `FieldBox` draws the
 * same box as a View. One ring while the control is open or focused, one dim when disabled.
 */
const fieldBoxVariants = cva(
	`border-chip-border bg-card rounded-field border-[length:var(--shape-ctl-border)] ${FIELD_TEXT}`,
	{
		variants: {
			state: {
				rest: '',
				open: 'border-ring web:ring-1 web:ring-ring',
				disabled: 'web:cursor-not-allowed opacity-45',
				invalid: 'border-bad',
				/** Its number needs a look (a cart line over stock). */
				attention: 'border-attention bg-attention/15',
			},
			/** A Textarea grows from one control's height. */
			multiline: { false: 'h-ctl', true: 'min-h-ctl' },
		},
		defaultVariants: { state: 'rest', multiline: false },
	}
);

/** Merged, so a state's border replaces the resting one rather than racing it in the CSS. */
function fieldBox(props?: VariantProps<typeof fieldBoxVariants>) {
	return cn(fieldBoxVariants(props));
}

type FieldBoxState = NonNullable<VariantProps<typeof fieldBoxVariants>['state']>;

type FieldBoxProps = ViewProps & {
	state?: FieldBoxState;
	/** Nothing chosen: the text inside reads as a placeholder. */
	empty?: boolean;
	/** Layout only (width, flex, padding); the look is the box's. */
	className?: string;
};

/** The box around a control's own content; text inside takes the field's tone. */
function FieldBox({ state = 'rest', empty = false, className, ...props }: FieldBoxProps) {
	return (
		<TextClassContext.Provider value={cn(FIELD_TEXT, empty && 'text-muted-foreground')}>
			<View className={cn(fieldBox({ state }), 'flex-row items-center', className)} {...props} />
		</TextClassContext.Provider>
	);
}

export { FieldBox, fieldBox };
export type { FieldBoxState };
