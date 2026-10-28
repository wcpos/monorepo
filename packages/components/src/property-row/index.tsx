import * as React from 'react';
import { View } from 'react-native';

import { Button, ButtonText } from '../button';
import { DocsLink } from '../docs-link';
import { FormItem } from '../form/common';
import { FormItemContext } from '../form/context';
import { SavedMark, useSavedName } from '../form/saved-mark';
import { useIsPhone } from '../lib/device';
import { cn } from '../lib/utils';
import { Switch } from '../switch';
import { Text, TextClassContext } from '../text';

/**
 * Property rows (Paul, 2026-10-25): a record is a list of facts, one row per fact, key · value ·
 * verb. Asked-for facts are rows even when empty; the rest wait in the add row. Nothing folds.
 */

/** The ink of an empty asked-for value ("Add email"); `EditableField`'s placeholder uses it too. */
export const PROPERTY_PLACEHOLDER_CLASS = 'text-muted-foreground text-base';

/** The row's own words, translated by the app once at its root (`DialogLabels`' pattern). */
export type PropertyRowLabels = { saved: string; open: string };
const Labels = React.createContext<PropertyRowLabels>({ saved: 'Saved', open: 'Open' });
export function PropertyRowLabelsProvider(
	props: React.PropsWithChildren<{ labels: PropertyRowLabels }>
) {
	return <Labels.Provider value={props.labels}>{props.children}</Labels.Provider>;
}

/** The list's rows' testID and form-item prefix, and its key column (`wide` on a settings page). */
const ListContext = React.createContext<{ prefix?: string; wide?: boolean }>({});

/**
 * The rows of one record (testID `<prefix>-form`), then at most one `PropertyAddRow`. No dividers:
 * rows separate by rhythm. The key column is 128 in a dialog, 256 / 288 on a settings page.
 */
export function PropertyList(props: {
	children: React.ReactNode;
	prefix?: string;
	wide?: boolean;
}) {
	const { prefix, wide } = props;
	const value = React.useMemo(() => ({ prefix, wide }), [prefix, wide]);
	return (
		<ListContext.Provider value={value}>
			<View testID={prefix && `${prefix}-form`} className="gap-0">
				{props.children}
			</View>
		</ListContext.Provider>
	);
}

/**
 * One fact, for a record and a setting alike: key · value · trailing. Off a phone the three share a
 * 44 line; on a phone (`useIsPhone`, the one layout boundary), or `stacked` (a value too big for the
 * line: a tile grid, a radio list), the key stacks above the value and the trailing slot stays on
 * the key's line.
 *
 * The row is the form item: `id` and the list's `prefix` give it the testID `<prefix>-row-<id>` and
 * the item id `<prefix>-<id>` (minted without them); its key is `<item>-form-item`, the label every
 * label-less control in the row adopts (not in a `compound` row). `name` is the form field (or fields) the row holds,
 * `id` by default: while one's Saved mark shows it takes the verb's place, never beside it.
 * The trailing slot is that mark-or-verb, then `control` (a Switch), which never moves.
 */
export function PropertyRow(props: {
	label: string;
	children?: React.ReactNode;
	prefix?: string;
	id?: string;
	name?: string | readonly string[];
	verb?: React.ReactNode;
	control?: React.ReactNode;
	/** One muted line under the key: what happens at the till. */
	help?: string;
	/** Set elsewhere (rule 6): the value, where it is set, and Open ↗ when there is a link. */
	locked?: { where: string; href?: string };
	/** A copy of another fact (rule 5): the value in muted ink, the verb breaks the link. */
	derived?: boolean;
	/** Two or more controls in the value (a custom field's key and value): each keeps its own item. */
	compound?: boolean;
	align?: 'center' | 'top';
	indent?: boolean;
	stacked?: boolean;
	testID?: string;
}) {
	const { id, locked } = props;
	const labels = React.useContext(Labels);
	const list = React.useContext(ListContext);
	const { wide } = list;
	const phone = useIsPhone();
	// Key · value · trailing on one line: off a phone, unless the value is too big for it.
	const line = !phone && !props.stacked;
	const prefix = props.prefix ?? list.prefix;
	const minted = React.useId();
	const item = prefix && id ? `${prefix}-${id}` : minted;
	const savedName = useSavedName();
	const marked = !!savedName && [props.name ?? id ?? []].flat().includes(savedName);
	// A trailing slot that carries words (locked's provenance, a verb) wraps on a phone.
	const words = !marked && (!!locked || !!props.verb);
	const end = marked ? (
		<SavedMark name={savedName} label={labels.saved} />
	) : locked ? (
		<>
			<Text variant="key">{locked.where}</Text>
			{locked.href ? <DocsLink href={locked.href}>{labels.open}</DocsLink> : null}
		</>
	) : (
		props.verb
	);
	let value = props.children;
	// A bare string under a View throws on native: a plain value is a Text. A locked boolean is
	// a disabled switch, an empty locked value a dash.
	if (locked && typeof value === 'boolean') {
		value = (
			<Switch
				checked={value}
				onCheckedChange={() => {}}
				disabled
				accessibilityLabel={props.label}
				testID={props.testID && `${props.testID}-switch`}
			/>
		);
	} else if (locked && !value) value = '—';
	if (typeof value === 'string' || typeof value === 'number') value = <Text>{value}</Text>;
	return (
		<FormItem
			nativeID={item}
			testID={props.testID ?? (prefix && id ? `${prefix}-row-${id}` : undefined)}
			className={cn(
				'min-h-ctl relative gap-1 py-1',
				line && 'flex-row gap-3',
				line && (props.align === 'top' ? 'items-start' : 'items-center')
			)}
		>
			<View
				className={cn(
					'min-h-9 justify-center',
					line && (wide ? 'w-64 shrink-0 lg:w-72' : 'w-32 shrink-0'),
					props.indent && 'pl-4'
				)}
			>
				<Key nativeID={`${item}-form-item`}>{props.label}</Key>
				{props.help ? <Text variant="help">{props.help}</Text> : null}
			</View>
			{/* On a settings page every value is one 320 column, so the trailing slot is one column too. */}
			<View className={cn('min-w-0', !phone && 'flex-1', !phone && wide && 'max-w-80')}>
				<TextClassContext.Provider
					value={props.derived ? 'text-muted-foreground text-base' : 'text-foreground text-base'}
				>
					{props.compound ? (
						<FormItemContext.Provider value={NO_ITEM}>{value}</FormItemContext.Provider>
					) : (
						value
					)}
				</TextClassContext.Provider>
			</View>
			{end || props.control ? (
				<View
					className={cn(
						'shrink-0 flex-row items-center gap-2',
						// A mark or a switch is narrow and sits on the key's line; words would lie over a
						// long key on a phone, so there they wrap in flow under the value.
						words ? 'flex-wrap' : !line && 'absolute top-1 right-0'
					)}
				>
					{end}
					{props.control}
				</View>
			) : null}
		</FormItem>
	);
}

/** A compound row's controls adopt no item: each names and messages itself. */
const NO_ITEM = { nativeID: '' };

/** The key presses the control it names (focus, toggle), as a form label does. */
function Key(props: { nativeID: string; children: string }) {
	const { pressLabel } = React.useContext(FormItemContext);
	return (
		<Text variant="key" nativeID={props.nativeID} onPress={pressLabel}>
			{props.children}
		</Text>
	);
}

type ActionProps = { onPress: () => void; testID?: string };

/**
 * The row's verb (Edit, Remove, Use a different address): a link Button, never a chevron.
 * `onPress` may come from an `asChild` trigger (a Dialog's) instead of the caller.
 */
export function PropertyVerb({
	children,
	...props
}: Partial<ActionProps> & { children: React.ReactNode }) {
	return (
		<Button variant="link" size="sm" {...props}>
			<ButtonText>{children}</ButtonText>
		</Button>
	);
}

/** The absent facts' add buttons, in canonical order, last in the list. */
export function PropertyAddRow({ children }: { children: React.ReactNode }) {
	return <View className="flex-row flex-wrap gap-2 pt-2">{children}</View>;
}

/** Adds one absent fact: an action, so a Button, never a Chip (a Chip is a selectable state). */
export function PropertyAdd({ label, ...props }: ActionProps & { label: string }) {
	return (
		<Button variant="outline" size="sm" leftIcon="plus" {...props}>
			<ButtonText>{label}</ButtonText>
		</Button>
	);
}

/** An empty asked-for value that is not being edited. */
export function PropertyPlaceholder({ children }: { children: React.ReactNode }) {
	return <Text className={PROPERTY_PLACEHOLDER_CLASS}>{children}</Text>;
}
