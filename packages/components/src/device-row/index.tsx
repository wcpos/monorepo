import * as React from 'react';
import { View } from 'react-native';

import { Badge } from '../badge';
import { Card } from '../card';
import { Icon, type IconName } from '../icon';
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
	/** What the row grows under its lines (a hint, the readers a scan found), then its actions. */
	children?: React.ReactNode;
	testID?: string;
};

/**
 * One device in a settings list (CODING_STANDARDS § Rows and cards): a card with an icon square
 * tinted by the state, the name and its tag, the identifiers, ONE state line, then the children
 * with the actions last in `DeviceRowActions`.
 * Stacked lines, never a wrap, so nothing shares a line with free text.
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
	return (
		<Card testID={testID} padding="row" className="gap-3">
			<View className="flex-row items-start gap-3">
				{icon ? (
					<View className={cn('size-10 items-center justify-center rounded-lg', TONE[mark].tinted)}>
						<Icon name={icon} variant={mark} size="lg" loading={busy} />
					</View>
				) : null}
				<View className="min-w-0 flex-1 gap-0.5">
					<View className="flex-row items-start gap-2">
						<Text variant="dialog" className="flex-1" numberOfLines={1}>
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
			</View>
			{progress ? (
				<Progress
					testID={id('progress')}
					value={progress.value}
					indeterminate={progress.value === undefined}
				/>
			) : null}
			{children}
		</Card>
	);
}

/** The action slot: a full-width row of its own under the lines, never beside free text. */
export function DeviceRowActions({ children }: { children: React.ReactNode }) {
	return <View className="w-full flex-row items-center justify-end gap-2">{children}</View>;
}
