import * as React from 'react';
import { View } from 'react-native';

import { Badge } from '../badge';
import { Icon, type IconName } from '../icon';
import { useIsPhone } from '../lib/device';
import { TONE, type Tone } from '../lib/tone';
import { cn } from '../lib/utils';
import { Progress } from '../progress';
import { StatusBadge } from '../status-badge';
import { Text } from '../text';

/** The row's one state line: a tone dot and the words. */
export type DeviceState = { label: string; tone: Tone; testID?: string };

type DeviceRowProps = {
	name: string;
	icon?: IconName;
	/** The icon square spins while the device is being looked for. */
	busy?: boolean;
	/** A short tag at the name line's right edge: the provider, the template kind, Default. */
	tag?: string;
	/** Line 2, joined by a middle dot: serial · location, address · vendor. Blanks drop out. */
	identifiers?: readonly (string | null | undefined | false)[];
	state?: DeviceState | null;
	/** A bar under the lines; no `value` is an unknown wait. */
	progress?: { value?: number } | null;
	/**
	 * What the row grows under its lines (a hint, the readers a scan found). A `DeviceRowActions`
	 * child is lifted out: inline at the line's right on a wide pane, last under the lines on a phone.
	 */
	children?: React.ReactNode;
	testID?: string;
};

/**
 * One device in a settings list (CODING_STANDARDS § Rows and cards): a flush list row, a hairline
 * under it, with an icon square tinted by the state, the name and its tag, the identifiers and ONE
 * state line, the actions (`DeviceRowActions`) at the right of the same line on a wide pane.
 */
export function DeviceRow({
	name,
	icon,
	busy,
	tag,
	identifiers,
	state,
	progress,
	children,
	testID,
}: DeviceRowProps) {
	const id = (part: string) => (testID ? `${testID}-${part}` : undefined);
	// Only a live link or a failure earns colour on the square; every other state is muted.
	const mark = state?.tone === 'ok' || state?.tone === 'bad' ? state.tone : 'muted';
	const line2 = identifiers?.filter(Boolean).join(' · ');
	const phone = useIsPhone();
	const parts = React.Children.toArray(children);
	const isActions = (child: React.ReactNode) =>
		React.isValidElement(child) && child.type === DeviceRowActions;
	const actions = parts.find(isActions) ?? null;
	const below = parts.filter((child) => !isActions(child));
	return (
		// list-row's hairline and gap; the last row of a list closes on the section, not a rule.
		<View testID={testID} className="border-border gap-3 border-b py-3 last:border-b-0">
			<View className="flex-row items-center gap-3">
				{icon ? (
					<View className={cn('size-10 items-center justify-center rounded-lg', TONE[mark].tinted)}>
						<Icon name={icon} variant={mark} size="lg" loading={busy} />
					</View>
				) : null}
				<View className="min-w-0 flex-1 gap-0.5">
					<View className="flex-row items-start gap-2">
						<Text variant="subheading" className="flex-1" numberOfLines={1}>
							{name}
						</Text>
						{tag ? (
							<Badge testID={id('tag')} variant="muted" className="max-w-32">
								{tag}
							</Badge>
						) : null}
					</View>
					{line2 ? (
						<Text testID={id('identifiers')} variant="key" numberOfLines={1}>
							{line2}
						</Text>
					) : null}
					{state ? (
						<StatusBadge
							testID={state.testID ?? id('state')}
							size="caption"
							variant={state.tone}
							label={state.label}
						/>
					) : null}
				</View>
				{phone ? null : actions}
			</View>
			{progress ? (
				<Progress
					testID={id('progress')}
					value={progress.value}
					indeterminate={progress.value === undefined}
				/>
			) : null}
			{below}
			{phone ? actions : null}
		</View>
	);
}

/** The action slot: `DeviceRow` places it (inline right, or under the lines on a phone). */
export function DeviceRowActions({ children }: { children: React.ReactNode }) {
	return <View className="shrink-0 flex-row items-center justify-end gap-2">{children}</View>;
}
