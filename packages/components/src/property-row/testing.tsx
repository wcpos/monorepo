import * as React from 'react';

import type * as Real from './index';

/**
 * The row for runners that cannot load it (Button, Switch, Reanimated): its ids and slots (testID
 * `<prefix>-row-<id>`, item `<prefix>-<id>`, key `<item>-form-item`, ledger line 9; the Saved mark
 * with the key and the verb kept, ledger line 21; locked's where and Open), pinned to the real row by `testing.test.tsx`.
 */
type RowProps = React.ComponentProps<typeof Real.PropertyRow>;

let form: Record<string, unknown> = {};
try {
	// eslint-disable-next-line @typescript-eslint/no-require-imports -- the suite's own mock, if any
	form = require('../form');
} catch {
	// The mark and the item come from the suite's form (its mock, or the real one); none here.
}
const useSavedName = (form.useSavedName ?? (() => '')) as () => string;
const SavedMark = form.SavedMark as React.ComponentType<{ name: string; label: string }>;
const FormItem = (form.FormItem ?? React.Fragment) as React.ComponentType<
	React.PropsWithChildren<{ nativeID?: string }>
>;

const List = React.createContext<string | undefined>(undefined);

export const PROPERTY_PLACEHOLDER_CLASS = 'text-muted-foreground text-base';

export function PropertyRowLabelsProvider({ children }: React.PropsWithChildren) {
	return <>{children}</>;
}

export function PropertyList({ prefix, children }: React.PropsWithChildren<{ prefix?: string }>) {
	return (
		<List.Provider value={prefix}>
			<div data-testid={prefix && `${prefix}-form`}>{children}</div>
		</List.Provider>
	);
}

export function PropertyRow(props: RowProps) {
	const listPrefix = React.useContext(List);
	const saved = useSavedName() ?? '';
	const prefix = props.prefix ?? listPrefix;
	const item = prefix && props.id ? `${prefix}-${props.id}` : undefined;
	const names = [props.name ?? props.id ?? []].flat();
	const mark =
		saved && SavedMark && names.includes(saved) ? (
			<SavedMark name={saved} label="settings.saved" />
		) : null;
	let value: React.ReactNode = props.children;
	if (props.locked && typeof value === 'boolean') {
		const testID = props.testID && `${props.testID}-switch`;
		value = <input type="checkbox" data-testid={testID} checked={value} disabled readOnly />;
	} else if (props.locked && !value) value = '—';
	return (
		<div
			data-testid={props.testID ?? (item && `${prefix}-row-${props.id}`)}
			data-form-item={item}
			data-indent={props.indent || undefined}
		>
			{props.label !== undefined && <span id={item && `${item}-form-item`}>{props.label}</span>}
			{mark}
			{props.help ? <span>{props.help}</span> : null}
			{/* The row is the form item: the suite's FormItem, if any, is what its controls adopt. */}
			<FormItem {...(FormItem === React.Fragment ? {} : { nativeID: item })}>
				{value}
				{props.locked ? <span>{props.locked.where}</span> : props.verb}
				{props.locked?.href ? <a href={props.locked.href}>Open</a> : null}
				{props.control}
			</FormItem>
		</div>
	);
}

type Pressable = { onPress?: () => void; testID?: string; disabled?: boolean };

function Action({ children, onPress, testID, disabled }: React.PropsWithChildren<Pressable>) {
	return (
		<button
			data-testid={testID}
			disabled={disabled}
			aria-disabled={disabled || undefined}
			onClick={onPress}
		>
			{children}
		</button>
	);
}

export const PropertyVerb = Action;

export function PropertyAddRow({ children }: React.PropsWithChildren) {
	return <div data-testid="add-row">{children}</div>;
}

export function PropertyAdd({ label, ...props }: Pressable & { label: string }) {
	return <Action {...props}>{label}</Action>;
}

export function PropertyPlaceholder({ children }: React.PropsWithChildren) {
	return <span>{children}</span>;
}
