import { cva, type VariantProps } from 'class-variance-authority';

import { Icon, IconName } from '../icon';
import { cn } from '../lib/utils';
import { PressableSurface, type PressableSurfaceProps } from '../pressable-surface';

/**
 *
 */
const buttonVariants = cva('items-center justify-center rounded-lg', {
	variants: {
		variant: {
			default: 'web:hover:bg-accent active:bg-accent',
			outline: 'border-border web:hover:bg-accent active:bg-accent border',
			primary: 'web:hover:bg-primary/15 active:bg-primary/15',
			// The default's full tint: 15% of `muted`, already a pale grey, drew no hover at all (the
			// table carets, Paul 2026-10-27). The glyph is muted either way.
			muted: 'web:hover:bg-accent active:bg-accent',
			destructive: 'web:hover:bg-destructive/15 active:bg-destructive/15',
			secondary: 'web:hover:bg-secondary/15 active:bg-secondary/15',
			ok: 'web:hover:bg-ok/15 active:bg-ok/15',
			// A title-bar item (Paul, 2026-10-30): no surface on hover or press; the glyph lifts instead.
			bare: '',
		},
		size: {
			default: 'size-ctl',
			xs: 'size-6',
			sm: 'size-8',
		},
	},
	defaultVariants: {
		variant: 'default',
		size: 'default',
	},
});

type ButtonProps = Omit<PressableSurfaceProps, 'role' | 'wash' | 'minTarget' | 'selected'> &
	VariantProps<typeof buttonVariants> & {
		name: IconName;
		/**
		 * The control's accessible name. An icon-only button has no text for a screen reader to
		 * announce, so the caller names what it does (translated) and TypeScript refuses an
		 * unnamed one.
		 */
		accessibilityLabel: string;
		loading?: boolean;
		/** Turn the glyph itself while true (Icon `spin`), instead of swapping it for the Loader. */
		spin?: boolean;
		on?: boolean;
		iconClassName?: string;
		className?: string;
	};

function IconButton({
	className,
	iconClassName,
	name,
	variant,
	size,
	loading,
	spin,
	on,
	...props
}: ButtonProps) {
	return (
		<PressableSurface
			role="button"
			// Each variant carries its own wash.
			wash="none"
			// `sm` and `xs` are drawn under 44 for a dense row; the finger still gets 44.
			minTarget={size === 'sm' || size === 'xs'}
			className={buttonVariants({ variant, size, className })}
			{...props}
		>
			{({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => (
				<Icon
					name={name}
					variant={
						variant === 'outline' || variant === 'bare'
							? 'default'
							: variant === 'destructive'
								? 'bad'
								: variant
					}
					size={size}
					loading={loading}
					spin={spin}
					className={cn(
						(!variant || variant === 'default') && 'text-muted-foreground',
						// Muted at rest, the foreground under the pointer or the finger, as a macOS title bar.
						variant === 'bare' &&
							(hovered || pressed ? 'text-foreground' : 'text-muted-foreground'),
						on && 'text-primary',
						iconClassName
					)}
					pointerEvents="none"
				/>
			)}
		</PressableSurface>
	);
}

export { IconButton };
