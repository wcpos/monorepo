import * as React from 'react';

/**
 * A light `@wcpos/components/property-row` for screen suites: the real row's ids and slots
 * (testID `<prefix>-row-<id>`, form item `<prefix>-<id>`, its key `<item>-form-item`, the mark
 * in the verb's place, locked's where and Open), without the Button, Switch and reanimated
 * imports each suite mocks its own way. The row itself is pinned by `property-row.test.tsx`.
 */
type RowProps = React.PropsWithChildren<{
	label: string;
	prefix?: string;
	id?: string;
	name?: string | readonly string[];
	verb?: React.ReactNode;
	control?: React.ReactNode;
	help?: string;
	locked?: { where: string; href?: string };
	indent?: boolean;
	testID?: string;
}>;

/**
 * The Saved mark and the form item come from the suite's `@wcpos/components/form` (its mock,
 * or the real module where it loads); a suite whose form cannot load under Jest gets neither.
 */
function formModule(): Record<string, unknown> {
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- the suite's own mock, if any
		return require('@wcpos/components/form');
	} catch {
		return {};
	}
}

const form = formModule();
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
		value = (
			<input
				type="checkbox"
				data-testid={props.testID && `${props.testID}-switch`}
				checked={value}
				disabled
				readOnly
			/>
		);
	} else if (props.locked && !value) value = '—';
	return (
		<div
			data-testid={props.testID ?? (item && `${prefix}-row-${props.id}`)}
			data-form-item={item}
			data-indent={props.indent || undefined}
		>
			<span id={item && `${item}-form-item`}>{props.label}</span>
			{props.help ? <span>{props.help}</span> : null}
			{/* The row is the form item: the suite's FormItem, if any, is what its controls adopt. */}
			<FormItem {...(FormItem === React.Fragment ? {} : { nativeID: item })}>
				{value}
				{mark ?? (props.locked ? <span>{props.locked.where}</span> : props.verb)}
				{props.locked?.href ? <a href={props.locked.href}>Open</a> : null}
				{props.control}
			</FormItem>
		</div>
	);
}

type Pressable = { onPress?: () => void; testID?: string };

export function PropertyVerb({ children, onPress, testID }: React.PropsWithChildren<Pressable>) {
	return (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	);
}

export function PropertyAddRow({ children }: React.PropsWithChildren) {
	return <div data-testid="add-row">{children}</div>;
}

export function PropertyAdd({ label, onPress, testID }: Pressable & { label: string }) {
	return (
		<button data-testid={testID} onClick={onPress}>
			{label}
		</button>
	);
}

export function PropertyPlaceholder({ children }: React.PropsWithChildren) {
	return <span>{children}</span>;
}
