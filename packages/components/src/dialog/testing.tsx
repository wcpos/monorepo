import * as React from 'react';

import { useDialogLabels, useDismissIsClose } from './labels';

import type * as Real from './index';

export { DialogLabelsProvider, DismissIsClose } from './labels';

/**
 * The dialog for runners that cannot load it (Button, Radix, Reanimated): its props, testIDs and
 * open/close rules in plain DOM, pinned to the real one by `testing.test.tsx`. Beyond it: `side`,
 * `size`, `portalHost` show as `data-` attributes; outside a `Dialog` the content is open.
 */
type Root = { open: boolean; setOpen: (open: boolean) => void };
const RootContext = React.createContext<Root>({ open: true, setOpen: () => {} });

export function Dialog({ open, defaultOpen, route, onClose, ...props }: Real.DialogProps) {
	const [own, setOwn] = React.useState(defaultOpen ?? false);
	const setOpen = (next: boolean) => {
		if (!route) {
			setOwn(next);
			props.onOpenChange?.(next);
			// eslint-disable-next-line @typescript-eslint/no-require-imports -- only a route dialog needs the router
		} else if (!next) (onClose ?? require('expo-router').router.back)();
	};
	const value = { open: !!route || (open ?? own), setOpen };
	return <RootContext.Provider value={value}>{props.children}</RootContext.Provider>;
}

export function DialogTrigger({ asChild, children, testID }: Box & { asChild?: boolean }) {
	const { setOpen } = React.useContext(RootContext);
	const onPress = () => setOpen(true);
	return asChild && React.isValidElement<{ onPress?: () => void }>(children) ? (
		React.cloneElement(children, { onPress })
	) : (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	);
}

export function useDialog(): { open: boolean; close: () => void } {
	const { open, setOpen } = React.useContext(RootContext);
	return { open, close: () => setOpen(false) };
}

export function DialogContent(props: Real.DialogContentProps): React.JSX.Element | null {
	const { testID, side = 'center', closeButtonProps: x } = props;
	const { close: closeLabel } = useDialogLabels();
	const { open, close } = useDialog();
	if (!open) return null;
	return (
		<div
			role="dialog"
			data-testid={testID}
			data-side={side}
			data-size={props.size}
			data-host={props.portalHost ?? undefined}
		>
			{props.children}
			<button
				data-testid={x?.testID ?? (testID ? `${testID}-close` : 'dialog-close')}
				aria-label={props.closeLabel ?? closeLabel}
				disabled={!!x?.disabled}
				onClick={close}
			/>
		</div>
	);
}

type Box = React.PropsWithChildren<{ testID?: string }>;
export function DialogHeader({ testID, children }: Box) {
	return <div data-testid={testID}>{children}</div>;
}
export function DialogTitle({ testID, children }: Box) {
	return <h1 data-testid={testID}>{children}</h1>;
}
export function DialogDescription({ testID, children }: Box) {
	return <p data-testid={testID}>{children}</p>;
}
export function DialogBody({ testID, children }: Box) {
	return <div data-testid={testID}>{children}</div>;
}

type Slot = Real.FooterSlot | Real.FooterSlot[];
const buttons = (slot: Slot, size: string, variant: string) =>
	[slot ?? []]
		.flat()
		.filter((entry): entry is Real.FooterButton => !!entry)
		.map((b) => (
			<button
				key={b.testID ?? b.label}
				data-testid={b.testID}
				data-size={size}
				data-variant={variant}
				data-loading={String(!!b.loading)}
				aria-label={b.accessibilityLabel}
				disabled={b.disabled || b.loading}
				onClick={b.onPress as unknown as React.MouseEventHandler}
			>
				<span data-loading={String(!!b.loading)}>{b.label}</span>
			</button>
		));

export function DialogFooter(props: Real.DialogFooterProps) {
	const { intent, close = true, size = 'default', testID } = props;
	const labels = useDialogLabels();
	const cancel = useDismissIsClose() ? labels.close : labels.cancel;
	const dialog = useDialog();
	const apart = [props.destructive ?? [], props.record ?? []].flat().some(Boolean);
	const own = typeof close === 'object' ? close : {};
	const dismiss = close && {
		...own,
		label: intent ? cancel : labels.close,
		testID: own.testID || (testID ? `${testID}-close` : 'dialog-footer-close'),
		onPress: (event: Parameters<NonNullable<Real.FooterButton['onPress']>>[0]) => {
			own.onPress?.(event);
			dialog.close();
		},
	};
	const leading = (
		<>
			{props.aside}
			{buttons(props.destructive, size, 'outline-destructive')}
			{buttons(props.record, size, 'outline')}
		</>
	);
	const trailing = (
		<>
			{buttons(dismiss, size, 'outline')}
			{buttons(props.secondary, size, 'outline')}
			{buttons(intent, size, 'default')}
		</>
	);
	const both = (
		<>
			{apart ? <div>{leading}</div> : leading}
			{apart ? <div>{trailing}</div> : trailing}
		</>
	);
	return testID ? <div data-testid={testID}>{both}</div> : both;
}
