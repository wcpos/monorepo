import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils';
import { TextClassContext } from '../text/context';

/**
 * What a field holds reads in the foreground, its placeholder muted. On the web react-native-web's
 * own `::placeholder` rule reads `--placeholderTextColor` and, with the variable unset, falls back to
 * the text colour over uniwind's `placeholder:` utility (same specificity, later in the cascade), so
 * every placeholder drew in the foreground; the variable is set here to the muted token.
 */
const FIELD_TEXT =
	'text-foreground placeholder:text-muted-foreground [--placeholderTextColor:var(--color-muted-foreground)] text-base';

/**
 * The closed face of every control: Input, Textarea, the pickers' triggers and the keypads'.
 * A TextInput cannot be wrapped, so this class string is the interface; `FieldBox` draws the
 * same box as a View. One ring while the control is open or focused, one dim when disabled.
 */
const fieldBoxVariants = cva(
	`border-chip-border bg-chip rounded-field border-[length:var(--shape-ctl-border)] ${FIELD_TEXT}`,
	{
		variants: {
			state: {
				rest: '',
				// A state that must be seen keeps a 1 px border even where the theme draws no resting
				// outline (Bold money, Codex on #3139): the later width wins over the token's.
				open: 'border-ring web:ring-1 web:ring-ring border',
				disabled: 'web:cursor-not-allowed opacity-45',
				invalid: 'border-bad border',
				/** Its number needs a look (a cart line over stock). */
				attention: 'border-attention bg-attention/15 border',
			},
			/** A Textarea grows from one control's height. */
			multiline: { false: 'h-ctl', true: 'min-h-ctl' },
			figure: { false: '', true: 'h-tile' },
		},
		defaultVariants: { state: 'rest', multiline: false, figure: false },
	}
);

/** Merged, so a state's border replaces the resting one rather than racing it in the CSS. */
function fieldBox(props?: VariantProps<typeof fieldBoxVariants>) {
	return cn(fieldBoxVariants(props));
}

type FieldBoxState = NonNullable<VariantProps<typeof fieldBoxVariants>['state']>;

type FieldBoxProps = ViewProps & {
	state?: FieldBoxState;
	figure?: boolean;
	/** Nothing chosen: the text inside reads as a placeholder. */
	empty?: boolean;
	/** Layout only (width, flex, padding); the look is the box's. */
	className?: string;
};

/** The box around a control's own content; text inside takes the field's tone. */
function FieldBox({ state = 'rest', empty = false, figure, className, ...props }: FieldBoxProps) {
	return (
		<TextClassContext.Provider value={cn(FIELD_TEXT, empty && 'text-muted-foreground')}>
			<View
				className={cn(fieldBox({ state, figure }), 'flex-row items-center', className)}
				{...props}
			/>
		</TextClassContext.Provider>
	);
}

export { FieldBox, fieldBox };
export type { FieldBoxState };
