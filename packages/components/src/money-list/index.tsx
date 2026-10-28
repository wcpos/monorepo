import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { cn } from '../lib/utils';
import { Text, TextClassContext } from '../text';

/**
 * Money read as a running account (the cart's totals, the tender ledger, an order's totals): a
 * row per fact, the label at the left and the amount at the right in tabular numerals, closed by
 * at most one total. The list draws; it never converts money: callers hand it the strings their
 * currency format made. The total closes the list at body size, semibold, so the screen's one
 * figure (`AmountFigure`) still leads (CODING_STANDARDS § Design 1 and 7).
 */
type MoneyTone = 'default' | 'destructive' | 'success';

const TONE: Record<MoneyTone, string> = {
	default: '',
	destructive: 'text-destructive',
	success: 'text-success',
};

interface MoneyRowProps extends Omit<ViewProps, 'children'> {
	/** A string, or nodes whose `Text` takes the label's tone (a coupon chip beside its word). */
	label: React.ReactNode;
	/** Formatted by the caller. A row with nothing to add up has none. */
	amount?: string;
	amountTestID?: string;
	/** Meaning, never decoration: a refund row is destructive, label and amount alike. */
	tone?: MoneyTone;
	/** A breakdown of the row above it: inset, at the help rank. */
	indent?: boolean;
}

function Line({
	label,
	amount,
	amountTestID,
	tone = 'default',
	indent = false,
	total = false,
	className,
	...props
}: MoneyRowProps & { total?: boolean }) {
	const text = cn(
		indent ? 'text-xs' : 'text-base',
		total && 'font-semibold',
		tone === 'default' && (indent || !total) && 'text-muted-foreground',
		TONE[tone]
	);
	return (
		<View
			className={cn(
				'flex-row items-center justify-between gap-2',
				indent && 'pl-3',
				total && 'border-border border-t pt-2',
				className
			)}
			{...props}
		>
			<TextClassContext.Provider value={text}>
				<View className="min-w-0 flex-1 flex-row items-center gap-2">
					{typeof label === 'string' ? <Text>{label}</Text> : label}
				</View>
			</TextClassContext.Provider>
			{amount === undefined ? null : (
				<Text
					testID={amountTestID}
					className={cn(
						text,
						!indent && tone === 'default' && 'text-foreground',
						'text-right tabular-nums'
					)}
				>
					{amount}
				</Text>
			)}
		</View>
	);
}

function Root({ className, ...props }: ViewProps) {
	return <View className={cn('gap-2', className)} {...props} />;
}

function Row(props: MoneyRowProps) {
	return <Line {...props} />;
}

/** The one closing row: a hairline above, the label and amount in the foreground, semibold. */
function Total(props: Omit<MoneyRowProps, 'indent'>) {
	return <Line {...props} total />;
}

const MoneyList = Object.assign(Root, { Row, Total });

export { MoneyList };
export type { MoneyRowProps, MoneyTone };
