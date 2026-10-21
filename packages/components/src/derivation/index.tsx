import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { Icon } from '../icon';
import { cn } from '../lib/utils';
import { TABLE_HEAD_TEXT } from '../table';
import { Text } from '../text';

/**
 * How we got here: the facts an answer was derived from, top to bottom on one rail, ending in
 * the answer. A fact is a muted disc, the answer a foreground disc. When the chain breaks, the
 * step that broke closes red with a cross and carries its cause; the steps after it go hollow
 * and quiet, and the rail below the break drops to half strength, so the eye lands on the break.
 *
 * Nothing animates: a derivation is read, not watched (CODING_STANDARDS § Design 6).
 */

export type DerivationStepState = 'fact' | 'result' | 'failed' | 'quiet';

const LastStepContext = React.createContext(false);

function Derivation({ children, className, ...props }: ViewProps) {
	const steps = React.Children.toArray(children).filter(React.isValidElement);
	return (
		<View role="list" className={className} {...props}>
			{steps.map((step, index) => (
				<LastStepContext.Provider key={step.key ?? index} value={index === steps.length - 1}>
					{step}
				</LastStepContext.Provider>
			))}
		</View>
	);
}

const BEAD = {
	fact: 'bg-muted-foreground',
	result: 'bg-foreground',
	failed: 'bg-destructive items-center justify-center',
	quiet: 'border-border border-2',
} as const;

interface DerivationStepProps extends ViewProps {
	/** What this fact is, in the table-head recipe: "Calculated from". */
	label: string;
	/** The fact itself, one weight up: "Customer billing address". */
	title?: React.ReactNode;
	/** One muted line after the step's content: a cause's fix, "None". */
	detail?: React.ReactNode;
	/** Right of the title line: the step's own result, when it has one. */
	trailing?: React.ReactNode;
	state?: DerivationStepState;
}

function DerivationStep({
	label,
	title,
	detail,
	trailing,
	state = 'fact',
	children,
	className,
	...props
}: DerivationStepProps) {
	const last = React.useContext(LastStepContext);
	const quiet = state === 'quiet';
	const hasContent = React.Children.toArray(children).length > 0;
	return (
		<View role="listitem" className={cn('flex-row gap-3', className)} {...props}>
			<View className="w-4 items-center">
				<View testID="derivation-bead" className={cn('size-4 rounded-full', BEAD[state])}>
					{state === 'failed' ? <Icon name="close" className="text-card size-2.5" /> : null}
				</View>
				{last ? null : (
					<View
						testID="derivation-rail"
						className={cn('bg-border w-0.5 flex-1', (state === 'failed' || quiet) && 'opacity-50')}
					/>
				)}
			</View>
			<View className={cn('min-w-0 flex-1', !last && 'pb-4')}>
				<Text className={cn(TABLE_HEAD_TEXT, state === 'failed' && 'text-destructive')}>
					{label}
				</Text>
				{title != null || trailing != null ? (
					<View className="mt-1 flex-row items-baseline gap-3">
						<View className="min-w-0 flex-1">
							{typeof title === 'string' ? (
								<Text
									className={cn(
										'text-base font-semibold',
										quiet && 'text-muted-foreground font-normal'
									)}
								>
									{title}
								</Text>
							) : (
								title
							)}
						</View>
						{trailing}
					</View>
				) : null}
				{children}
				{detail != null ? (
					<Text className={cn('text-muted-foreground text-sm', hasContent ? 'mt-2' : 'mt-1')}>
						{detail}
					</Text>
				) : null}
			</View>
		</View>
	);
}

export { Derivation, DerivationStep };
export type { DerivationStepProps };
