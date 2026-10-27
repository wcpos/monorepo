import * as React from 'react';
import { View } from 'react-native';

import { Button, ButtonText } from '../button';
import { cn } from '../lib/utils';
import { Text, TextClassContext } from '../text';

/**
 * Property rows (Paul, 2026-10-25): a record is a list of facts, one row per fact, key · value ·
 * verb. Asked-for facts are rows even when empty; the rest wait in the add row. Nothing folds.
 */

/** The ink of an empty asked-for value ("Add email"); `EditableField`'s placeholder uses it too. */
export const PROPERTY_PLACEHOLDER_CLASS = 'text-muted-foreground text-base';

/** The rows of one record, then at most one `PropertyAddRow`. No dividers: rows separate by rhythm. */
export function PropertyList({ children, testID }: { children: React.ReactNode; testID?: string }) {
	return (
		<View testID={testID} className="gap-0">
			{children}
		</View>
	);
}

/**
 * One fact. On `md+` key, value and trailing (a verb, a SavedMark, a Switch) share a 44 line;
 * under `md` the key stacks above the value and the trailing slot stays on the key's line.
 * `indent` is a part of an open compound (an address's street); `align="top"` a multi-line value;
 * `nativeID` names the key so a control in the value slot can point at it.
 */
export function PropertyRow(props: {
	label: string;
	children?: React.ReactNode;
	trailing?: React.ReactNode;
	align?: 'center' | 'top';
	indent?: boolean;
	nativeID?: string;
	testID?: string;
}) {
	return (
		<View
			testID={props.testID}
			className={cn(
				'min-h-ctl relative gap-1 py-1 md:flex-row md:gap-3',
				props.align === 'top' ? 'md:items-start' : 'md:items-center'
			)}
		>
			<View className={cn('min-h-9 justify-center md:w-32 md:shrink-0', props.indent && 'pl-4')}>
				<Text nativeID={props.nativeID} className="text-muted-foreground text-sm">
					{props.label}
				</Text>
			</View>
			<View className="min-w-0 md:flex-1">
				<TextClassContext.Provider value="text-foreground text-base">
					{/* A bare string under a View throws on native: a plain value is a Text. */}
					{typeof props.children === 'string' || typeof props.children === 'number' ? (
						<Text>{props.children}</Text>
					) : (
						props.children
					)}
				</TextClassContext.Provider>
			</View>
			{props.trailing ? (
				<View className="absolute top-1 right-0 shrink-0 flex-row items-center gap-2 md:relative md:top-0">
					{props.trailing}
				</View>
			) : null}
		</View>
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
