import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { cn } from '../lib/utils';
import { Text } from '../text';
import { TEXT_LADDER } from '../text/ladder';

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
	/** In the row's tone, HTML entities decoded (a product's name); an element is drawn as given. */
	label: string | React.ReactElement;
	/** Beside the label: a coupon chip, a paid-by badge, a muted note. */
	beside?: React.ReactNode;
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
	beside,
	amount,
	amountTestID,
	tone = 'default',
	indent = false,
	total = false,
	className,
	...props
}: MoneyRowProps & { total?: boolean }) {
	const text = cn(
		indent ? TEXT_LADDER.help : 'text-base',
		total && 'font-semibold',
		tone === 'default' && !indent && !total && 'text-muted-foreground',
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
			<View className="min-w-0 flex-1 flex-row items-center gap-2">
				{typeof label === 'string' ? (
					<Text className={cn('shrink', text)} decodeHtml>
						{label}
					</Text>
				) : (
					label
				)}
				{beside}
			</View>
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
