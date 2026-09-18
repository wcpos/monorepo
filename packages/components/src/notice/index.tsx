import * as React from 'react';
import { AccessibilityInfo, Platform, View, type ViewProps } from 'react-native';

import { Button, ButtonText } from '../button';
import { DocsLink } from '../docs-link';
import { HStack } from '../hstack';
import { Icon, type IconName } from '../icon';
import { cn } from '../lib/utils';
import { Text } from '../text';
import { VStack } from '../vstack';

type NoticeAction = { label: string; onPress: () => void; testID?: string };
type NoticeProps = ViewProps & {
	tone: 'warn' | 'info' | 'bad';
	icon?: IconName;
	title: string;
	description?: string;
	actions?: readonly [NoticeAction] | readonly [NoticeAction, NoticeAction];
	docs?: { label: string; href: string; testID?: string };
};
const tones = {
	warn: { surface: 'border-warn/45 bg-warn-bg', icon: 'triangleExclamation' },
	info: { surface: 'border-border bg-card', icon: 'circleInfo' },
	bad: { surface: 'border-bad/45 bg-bad-bg', icon: 'circleExclamation' },
} as const;

export function Notice({
	tone,
	icon,
	title,
	description,
	actions,
	docs,
	testID,
	className,
	...props
}: NoticeProps) {
	const style = tones[tone];
	// iOS has no live region (`aria-live` maps to Android's accessibilityLiveRegion), so a
	// mounted outage is spoken explicitly there; the live region covers Android and web.
	const spoken = React.useRef(tone === 'bad' ? title : undefined);
	React.useEffect(() => {
		if (spoken.current && Platform.OS === 'ios')
			AccessibilityInfo.announceForAccessibility(spoken.current);
	}, []);
	const id = (part: string) => (testID ? `${testID}-${part}` : undefined);
	return (
		<View
			{...props}
			testID={testID}
			role={tone === 'bad' ? 'alert' : 'status'}
			aria-live={tone === 'bad' ? 'assertive' : 'polite'}
			className={cn(
				'flex-row flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5',
				style.surface,
				className
			)}
		>
			<Icon name={icon ?? style.icon} className="text-foreground" />
			<VStack className="min-w-0 flex-1 basis-48">
				<Text testID={id('title')} className="text-foreground font-medium">
					{title}
				</Text>
				{description && (
					<Text testID={id('description')} className="text-muted-foreground">
						{description}
					</Text>
				)}
			</VStack>
			{(actions || docs) && (
				<HStack className="flex-wrap gap-2">
					{actions?.map((action, index) => (
						<Button
							key={index}
							variant="ghost-quiet"
							size="sm"
							className="h-auto min-h-9 py-1"
							testID={action.testID ?? id(`action-${index}`)}
							onPress={action.onPress}
						>
							<ButtonText className="web:whitespace-normal text-clip">{action.label}</ButtonText>
						</Button>
					))}
					{docs && (
						<DocsLink href={docs.href} testID={docs.testID ?? id('docs')}>
							{docs.label}
						</DocsLink>
					)}
				</HStack>
			)}
		</View>
	);
}
