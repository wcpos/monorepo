import * as React from 'react';
import { type KeyDownEvent, View, type ViewInstance } from 'react-native';

import { Button } from '../button';
import { decimalRow, Key, type KeypadKey } from '../keypad';
import { isWeb, useOverlayPresentation } from '../lib/overlay';
import { cn } from '../lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';
import { type Grow, growFrame, ROW } from './frame';

import type { TriggerRef } from '@rn-primitives/popover';

/** The keys every keypad types with; a physical digit is its own name. */
const KEY_NAMES: Record<string, string> = { Backspace: 'backspace', Enter: 'done' };

/** The number the keypad edits, drawn by the caller; the row it is in lands on the trigger. */
type GrowDisplay = { display: React.ReactNode; span?: number };
export type GrowCell = KeypadKey | GrowDisplay;

/** The last two rows of both keypads: the store's separator, 0, ⌫, then ✓ across the panel. */
export function closingRows(
	decimalSeparator: string | undefined,
	labels: { backspace: string; done: string }
): KeypadKey[][] {
	return [
		decimalRow(decimalSeparator, labels.backspace),
		[{ name: 'done', label: labels.done, icon: 'check', variant: 'primary', span: 3 }],
	];
}

export type GrowKeypadHandle = {
	open: () => void;
	/** Closes keeping the stored value, as Escape does. */
	dismiss: () => void;
};

type GrowKeypadProps = {
	/** The trigger at rest; its own testID and look are the caller's. */
	children: React.ReactElement;
	/** Rows top to bottom as they open downward; the first lands on the trigger. */
	rows: GrowCell[][];
	/** How many leading rows a hairline sets off from the keys. */
	ruled: number;
	/** An anchored cell's width. */
	cell: number;
	align: 'center' | 'end';
	/** The literal `web:animate-*` classes for growing down and up. */
	animation: { down: string; up: string };
	disabled?: boolean;
	/** The store's decimal separator: the physical key, beside `.` and `,`, that types `decimal`. */
	decimalSeparator: string;
	/** Physical keys beyond the shared digits, separators, Backspace and Enter. */
	keyNames?: Record<string, string>;
	/** A key, pressed or typed on the physical keyboard; `done` is the shell's own. */
	onPress: (name: string, fromKeyboard: boolean) => void;
	onOpen: () => void;
	/** `discarded`: Escape or `dismiss()`, so nothing typed is committed. */
	onClose: (discarded: boolean) => void;
	onOpenChange?: (open: boolean) => void;
	/**
	 * The popover root's classes. The primitive's root is a plain `View` around the trigger, so a
	 * trigger meant to fill its cell (`flex-1`) must fill this first: a percentage height on the
	 * trigger resolves against a content-sized root and draws 18 px tall (#3069, 2026-10-29).
	 */
	className?: string;
	ref?: React.Ref<GrowKeypadHandle>;
};

/**
 * The trigger that grows in place into a keypad (decision 36): an anchored panel of flat 48 px
 * rows whose first row lands on the trigger, opening upward when it would leave the window;
 * on a phone the popover is the bottom sheet. The callers own their entry; this owns opening,
 * focus, the physical keyboard and Done.
 */
export function GrowKeypad({
	children,
	rows,
	ruled,
	cell,
	align,
	animation,
	disabled = false,
	decimalSeparator,
	keyNames,
	onPress,
	onOpen,
	onClose,
	onOpenChange: onOpenChangeProp,
	className,
	ref,
}: GrowKeypadProps) {
	const trigger = React.useRef<TriggerRef>(null);
	const panel = React.useRef<ViewInstance>(null);
	const [frame, setFrame] = React.useState({ open: false, grow: 'down' as Grow, offset: 0 });
	// Escape and dismiss() keep the stored value; every other close commits.
	const discard = React.useRef(false);
	const isOpen = React.useRef(false);
	const close = () => trigger.current?.close();
	const dismiss = () => {
		discard.current = true;
		close();
	};
	React.useImperativeHandle(ref, () => ({
		open: () => !disabled && trigger.current?.open(),
		dismiss,
	}));
	// A pointer press leaves focus on the key; back on the panel, the next Enter is Done.
	const focusPanel = () =>
		isWeb && (panel.current as unknown as HTMLElement | null)?.focus({ preventScroll: true });

	const onOpenChange = (open: boolean) => {
		if (open === isOpen.current) return;
		isOpen.current = open;
		onOpenChangeProp?.(open);
		if (open) {
			discard.current = false;
			const box = (trigger.current as unknown as HTMLElement | null)?.getBoundingClientRect?.();
			setFrame({ open, ...growFrame(box, rows.length * ROW, window.innerHeight) });
			onOpen();
		} else {
			onClose(discard.current);
			setFrame((current) => ({ ...current, open }));
		}
	};

	const press = (name: string, fromKeyboard = false) => {
		if (name === 'done') return close();
		onPress(name, fromKeyboard);
		if (!discard.current) focusPanel();
	};

	// Web: the physical keyboard while the panel holds focus.
	const onKeyDown = (event: KeyDownEvent) => {
		const { key } = event.nativeEvent;
		if (key === 'Escape') {
			discard.current = true;
			return;
		}
		// A focused key takes its own Enter; the panel's Enter is Done.
		if (key === 'Enter' && event.target !== event.currentTarget) return;
		// Both: a numeric keypad types '.' on a ',' store.
		const name = /^[0-9]$/.test(key)
			? key
			: key === '.' || key === ',' || key === decimalSeparator
				? 'decimal'
				: (KEY_NAMES[key] ?? keyNames?.[key]);
		if (!name) return;
		event.preventDefault();
		press(name, true);
	};

	return (
		<Popover onOpenChange={onOpenChange} className={className}>
			<PopoverTrigger ref={trigger} asChild disabled={disabled}>
				{children}
			</PopoverTrigger>
			<PopoverContent
				align={align}
				side={frame.grow === 'up' ? 'top' : 'bottom'}
				sideOffset={frame.offset}
				avoidCollisions={false}
				onEscapeKeyDown={() => {
					discard.current = true;
				}}
				// The panel takes the keys, not its first key: Enter is Done, never a press of −.
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					focusPanel();
				}}
				{...({ dataSet: { grow: frame.grow } } as object)}
				className={cn(
					'w-auto overflow-hidden p-0',
					frame.open && (frame.grow === 'up' ? animation.up : animation.down)
				)}
			>
				<Keys
					panel={panel}
					rows={rows}
					ruled={ruled}
					cell={cell}
					grow={frame.grow}
					onPress={press}
					onKeyDown={onKeyDown}
				/>
			</PopoverContent>
		</Popover>
	);
}

/**
 * The grid: flat cells under the panel's one border when anchored, the leading rows hairlined
 * off the keys; on the phone sheet, the first row bordered, stretched muted keys and Done in
 * ✓'s place.
 */
function Keys({
	panel,
	rows,
	ruled,
	cell,
	grow,
	onPress,
	onKeyDown,
}: {
	panel: React.RefObject<ViewInstance | null>;
	rows: GrowCell[][];
	ruled: number;
	cell: number;
	grow: Grow;
	onPress: (name: string) => void;
	onKeyDown: (event: KeyDownEvent) => void;
}) {
	const sheet = useOverlayPresentation() === 'bottom';
	// Growing up, the keys sit above and the first row lands on the trigger.
	const ordered = grow === 'up' && !sheet ? [...rows.slice(1), rows[0]] : rows;
	const size = (span = 1) => (sheet ? undefined : { width: cell * span, height: ROW });
	return (
		<View
			ref={panel}
			// The sheet has no primitive Content to focus it: tabbable, the panel is what the
			// shell focuses once the sheet has risen, so Enter is Done there too, never the −.
			tabIndex={sheet ? 0 : -1}
			onKeyDown={onKeyDown}
			className={cn('web:outline-none', sheet && 'gap-2')}
		>
			{ordered.map((row) => {
				const index = rows.indexOf(row);
				const first = index === 0;
				return (
					<View
						key={index}
						className={cn(
							'flex-row',
							sheet && (first ? 'border-border overflow-hidden rounded-lg border' : 'gap-2'),
							!sheet &&
								index < ruled &&
								(first && grow === 'up' ? 'border-border border-t' : 'border-border border-b')
						)}
					>
						{row.map((key) =>
							'display' in key ? (
								<View
									key="display"
									style={size(key.span)}
									aria-live="polite"
									className={cn('justify-center', sheet && 'min-h-ctl flex-1')}
								>
									{key.display}
								</View>
							) : sheet && key.name === 'done' ? (
								<Button
									key="done"
									testID="keypad-key-done"
									className="flex-1"
									onPress={() => onPress('done')}
								>
									{key.label}
								</Button>
							) : (
								<Key
									key={key.name}
									{...key}
									face={sheet && !first ? 'key' : 'cell'}
									onPress={() => onPress(key.name)}
									style={size(key.span)}
									className={sheet ? (first ? 'min-h-ctl w-14' : 'flex-1') : undefined}
								/>
							)
						)}
					</View>
				);
			})}
		</View>
	);
}
