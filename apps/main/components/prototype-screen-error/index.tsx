/*
 * Throwaway prototype for roadmap#442 on branch proto/442-screen-error-fallback.
 * Never merged.
 */
import * as React from 'react';
import { Platform, View } from 'react-native';

import { Slot, useRouter } from 'expo-router';

import { Button, ButtonText } from '@wcpos/components/button';
import { Card, CardContent } from '@wcpos/components/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import { EmptyState } from '@wcpos/components/empty-state';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { useIsPhone } from '@wcpos/components/lib/device';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { ManagementBar } from '@wcpos/core/screens/main/components/management-bar';

const COPY = {
	title: 'Reports',
	headline: 'This screen hit a problem',
	reassurance: 'Your sales are safe. The register is still running.',
	retry: 'Try again',
	register: 'Go to register',
	code: 'CLIENT151',
	details: 'Details',
	variant: 'Variant',
	broken: 'broken',
	retries: 'retries',
	yes: 'yes',
	no: 'no',
	breakAgain: 'Break again',
	previous: '←',
	next: '→',
};
const VARIANTS = ['a', 'b', 'c'] as const;
const VARIANT_NAMES = { a: 'Empty state', b: 'Centred card', c: 'Row card' };
const ERROR = new Error("Cannot read properties of undefined (reading 'total')");

type Variant = (typeof VARIANTS)[number];
type CardProps = { error: Error; onRetry: () => void; onRegister: () => void };

function EmptyStateVariant({ onRetry, onRegister }: CardProps) {
	return (
		<View className="flex-1 items-center justify-center">
			<EmptyState
				className="flex-none"
				kind="failed"
				title={COPY.headline}
				description={COPY.reassurance}
				action={{ label: COPY.retry, onPress: onRetry, testID: 'proto-screen-error-retry' }}
			/>
			<Button variant="ghost" onPress={onRegister} testID="proto-screen-error-register">
				<ButtonText>{COPY.register}</ButtonText>
			</Button>
		</View>
	);
}

function CentredCardVariant({ error, onRetry, onRegister }: CardProps) {
	const phone = useIsPhone();
	const Actions = phone ? VStack : HStack;
	return (
		<View className="flex-1 items-center justify-center p-4">
			<Card className="w-full max-w-md">
				<CardContent className="pt-4">
					<VStack className="gap-4">
						<Icon name="triangleExclamation" size="2xl" className="text-warning" />
						<Text className="text-foreground font-semibold">{COPY.headline}</Text>
						<Text className="text-muted-foreground">{COPY.reassurance}</Text>
						<Actions className="gap-3">
							<Button
								variant="default"
								className={phone ? 'w-full' : undefined}
								onPress={onRetry}
								testID="proto-screen-error-retry"
							>
								<ButtonText>{COPY.retry}</ButtonText>
							</Button>
							<Button
								variant="outline"
								className={phone ? 'w-full' : undefined}
								onPress={onRegister}
								testID="proto-screen-error-register"
							>
								<ButtonText>{COPY.register}</ButtonText>
							</Button>
						</Actions>
						<Collapsible>
							<CollapsibleTrigger asChild testID="proto-screen-error-details-trigger">
								<Button variant="link" size="sm" testID="proto-screen-error-details">
									<ButtonText>{COPY.details}</ButtonText>
								</Button>
							</CollapsibleTrigger>
							<CollapsibleContent>
								<Text className="text-muted-foreground text-xs">
									{COPY.code} · {error.message}
								</Text>
							</CollapsibleContent>
						</Collapsible>
					</VStack>
				</CardContent>
			</Card>
		</View>
	);
}

function RowCardVariant({ onRetry, onRegister }: CardProps) {
	const phone = useIsPhone();
	return (
		<View className="p-4">
			<Card className="w-full">
				<CardContent className="pt-4">
					<VStack className="gap-3">
						<HStack className="items-start gap-3">
							<View className="bg-warning/15 size-10 items-center justify-center rounded-lg">
								<Icon name="triangleExclamation" size="xl" className="text-warning" />
							</View>
							<VStack className="flex-1">
								<Text className="text-foreground text-base font-semibold">{COPY.headline}</Text>
								<Text className="text-muted-foreground">{COPY.reassurance}</Text>
								<Text className="text-muted-foreground text-xs">{COPY.code}</Text>
							</VStack>
						</HStack>
						<HStack className="w-full">
							<Button
								variant="default"
								className={phone ? 'w-full' : undefined}
								onPress={onRetry}
								testID="proto-screen-error-retry"
							>
								<ButtonText>{COPY.retry}</ButtonText>
							</Button>
						</HStack>
						<Button
							variant="link"
							className="self-start"
							leftIcon={<Icon name="cashRegister" size="xl" />}
							onPress={onRegister}
							testID="proto-screen-error-register"
						>
							<ButtonText>{COPY.register}</ButtonText>
						</Button>
					</VStack>
				</CardContent>
			</Card>
		</View>
	);
}

function ProtoSwitcher({
	variant,
	broken,
	attempts,
	onBreak,
}: {
	variant: Variant;
	broken: boolean;
	attempts: number;
	onBreak: () => void;
}) {
	const router = useRouter();
	const cycle = React.useCallback(
		(direction: number) => {
			const index = (VARIANTS.indexOf(variant) + direction + VARIANTS.length) % VARIANTS.length;
			router.replace({ pathname: '/reports', params: { variant: VARIANTS[index] } });
		},
		[router, variant]
	);
	// The web keyboard shortcut subscribes to window events and must be removed on unmount.
	React.useEffect(() => {
		if (Platform.OS !== 'web') return;
		function onKeyDown(event: KeyboardEvent) {
			const active = document.activeElement as HTMLElement | null;
			if (
				active?.tagName === 'INPUT' ||
				active?.tagName === 'TEXTAREA' ||
				active?.isContentEditable
			) {
				return;
			}
			if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
				event.preventDefault();
				cycle(event.key === 'ArrowLeft' ? -1 : 1);
			}
		}
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [cycle]);
	return (
		<VStack className="bg-card border-border absolute bottom-4 self-center rounded-lg border p-2">
			<HStack className="gap-2">
				<Button
					variant="ghost"
					size="sm"
					onPress={() => cycle(-1)}
					testID="proto-screen-error-prev"
				>
					<ButtonText>{COPY.previous}</ButtonText>
				</Button>
				<Text>
					{COPY.variant} {variant.toUpperCase()} — {VARIANT_NAMES[variant]}
				</Text>
				<Button variant="ghost" size="sm" onPress={() => cycle(1)} testID="proto-screen-error-next">
					<ButtonText>{COPY.next}</ButtonText>
				</Button>
			</HStack>
			<HStack className="justify-center gap-3">
				<Text className="text-muted-foreground text-xs">
					{COPY.broken}: {broken ? COPY.yes : COPY.no} · {COPY.retries}: {attempts}
				</Text>
				<Button variant="ghost" size="sm" onPress={onBreak} testID="proto-screen-error-break">
					<ButtonText>{COPY.breakAgain}</ButtonText>
				</Button>
			</HStack>
		</VStack>
	);
}

const CARDS = { a: EmptyStateVariant, b: CentredCardVariant, c: RowCardVariant };

export function PrototypeScreenError({ variant }: { variant: 'a' | 'b' | 'c' }) {
	const router = useRouter();
	const [broken, setBroken] = React.useState(true);
	const [attempts, setAttempts] = React.useState(0);
	const VariantCard = CARDS[variant];
	function onRetry() {
		setBroken(false);
		setAttempts((count) => count + 1);
	}
	return (
		<View className="bg-background flex-1">
			{broken ? (
				<>
					<ManagementBar title={COPY.title} testID="proto-screen-error-bar" />
					<VariantCard error={ERROR} onRetry={onRetry} onRegister={() => router.navigate('/')} />
				</>
			) : (
				<Slot />
			)}
			<ProtoSwitcher
				variant={variant}
				broken={broken}
				attempts={attempts}
				onBreak={() => setBroken(true)}
			/>
		</View>
	);
}
