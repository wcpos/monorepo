import * as React from 'react';
import { ScrollView } from 'react-native';

import { Button, ButtonText } from '../button';
import { Card } from '../card';
import { DocsLink } from '../docs-link';
import { useIsPhone } from '../lib/device';
import { cn } from '../lib/utils';
import { Logo } from '../logo';
import { Text } from '../text';
import { ToneDisc } from '../tone-disc';
import { VStack } from '../vstack';

import type { IconName } from '../icon';

/**
 * `disabled` keeps the slot while its state changes (Take over → Taking over…), never empties it.
 * `destructive` is for the primary only, confirming a loss: the filled red Button. A secondary
 * ignores it.
 */
type GateAction = {
	label: string;
	onPress: () => void;
	testID?: string;
	disabled?: boolean;
	destructive?: boolean;
};
export type GateScreenProps = {
	tone: 'warning' | 'bad' | 'muted';
	/** Overrides the tone's default glyph: warning → warning, bad → alert, muted → info. */
	icon?: IconName;
	title: string;
	description?: string;
	/** One monospace line (a thrown message). Never a stack. */
	detail?: string;
	primary?: GateAction;
	secondary?: GateAction;
	docs?: { label: string; href: string; code?: string; testID?: string };
	testID?: string;
};

/**
 * The one screen for a state that replaces the whole app: a protocol refusal, a plugin too old,
 * a missing route. The sign-in mark above one card at the sign-in reading width; no bar, no rail.
 */
export function GateScreen({
	tone,
	icon,
	title,
	description,
	detail,
	primary,
	secondary,
	docs,
	testID = 'gate-screen',
}: GateScreenProps) {
	const phone = useIsPhone();
	const mark = phone ? 64 : 80;
	return (
		<ScrollView
			className="bg-background flex-1"
			contentContainerClassName="grow items-center justify-center p-4"
			keyboardShouldPersistTaps="handled"
		>
			<VStack testID={testID} className="w-full items-center gap-4">
				<Logo width={mark} height={mark} />
				<Card className={cn('w-full max-w-md', phone ? 'p-4' : 'p-8')}>
					<VStack className="items-center gap-4">
						<ToneDisc tone={tone} icon={icon} />
						<Text
							testID={`${testID}-title`}
							role="heading"
							className="text-foreground text-center text-xl font-semibold"
						>
							{title}
						</Text>
						{description ? (
							<Text testID={`${testID}-description`} className="text-muted-foreground text-center">
								{description}
							</Text>
						) : null}
						{detail ? (
							<Text
								testID={`${testID}-detail`}
								selectable
								variant="help"
								className="bg-muted w-full rounded-md px-3 py-2 font-mono"
							>
								{detail}
							</Text>
						) : null}
						{primary || secondary ? (
							<VStack className="w-full gap-2">
								{primary ? (
									<GateButton
										action={primary}
										variant={primary.destructive ? 'destructive' : 'default'}
										testID={`${testID}-primary`}
									/>
								) : null}
								{secondary ? (
									<GateButton action={secondary} variant="outline" testID={`${testID}-secondary`} />
								) : null}
							</VStack>
						) : null}
						{docs ? (
							<DocsLink
								href={docs.href}
								code={docs.code}
								testID={docs.testID ?? `${testID}-docs`}
								className="self-center"
							>
								{docs.label}
							</DocsLink>
						) : null}
					</VStack>
				</Card>
			</VStack>
		</ScrollView>
	);
}

function GateButton({
	action,
	variant,
	testID,
}: {
	action: GateAction;
	variant: 'default' | 'destructive' | 'outline';
	testID: string;
}) {
	return (
		<Button
			variant={variant}
			className="min-h-ctl h-auto w-full"
			testID={action.testID ?? testID}
			disabled={action.disabled}
			onPress={action.onPress}
		>
			{/* A gate's label wraps rather than truncates: a long translation keeps every word. */}
			<ButtonText numberOfLines={0} className="web:whitespace-normal text-center text-clip">
				{action.label}
			</ButtonText>
		</Button>
	);
}
