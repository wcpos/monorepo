import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { Button } from '../button';
import { DocsLink } from '../docs-link';
import { HStack } from '../hstack';
import { Icon, type IconName } from '../icon';
import { cn } from '../lib/utils';
import { Text } from '../text';

type EmptyStateAction = { label: string; onPress: () => void; testID?: string };
type EmptyStateDocs = { label: string; href: string; testID?: string };
type EmptyStateProps = ViewProps & {
	kind: 'empty' | 'no-results' | 'failed';
	size?: 'surface' | 'inline';
	icon?: IconName;
	title: string;
	description?: string;
	action?: EmptyStateAction;
	docs?: EmptyStateDocs;
	autoFocus?: boolean;
};
const icons = {
	empty: 'circleInfo',
	'no-results': 'magnifyingGlass',
	failed: 'triangleExclamation',
} as const;

export function EmptyState({
	kind,
	size = 'surface',
	icon,
	title,
	description,
	action,
	docs,
	autoFocus,
	testID,
	className,
	...props
}: EmptyStateProps) {
	const actionRef = React.useRef<View>(null);
	const focusOnMount = React.useRef(!!(autoFocus && action));
	// Focus is an opt-in DOM side effect, only at mount, never on a kind change.
	React.useEffect(() => {
		if (focusOnMount.current) actionRef.current?.focus?.();
	}, []);
	const inline = size === 'inline';
	const id = (part: string) => (testID ? `${testID}-${part}` : undefined);
	return (
		<View
			{...props}
			testID={testID}
			{...{ dataSet: { kind } }}
			className={cn(
				inline
					? 'flex-row flex-wrap items-center gap-2 py-2'
					: 'flex-1 items-center justify-center gap-2 p-6',
				className
			)}
		>
			{!inline && <Icon name={icon ?? icons[kind]} size="3xl" className="text-muted-foreground" />}
			<Text
				testID={id('title')}
				className={
					inline ? 'text-muted-foreground text-sm' : 'text-foreground text-center font-medium'
				}
			>
				{title}
			</Text>
			{!inline && description && (
				<Text testID={id('description')} className="text-muted-foreground text-center text-sm">
					{description}
				</Text>
			)}
			{(action || docs) && (
				<HStack className="items-center gap-3">
					{action && (
						<Button
							{...{ ref: actionRef }}
							variant="ghost-quiet"
							size="sm"
							testID={action.testID ?? id('action')}
							onPress={action.onPress}
						>
							{action.label}
						</Button>
					)}
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
