import * as React from 'react';
import { type TextInputInstance, View } from 'react-native';

import { Chip } from '@wcpos/components/chip';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { Input } from '@wcpos/components/input';
import { decimalRow, DIGIT_ROWS, Keypad } from '@wcpos/components/keypad';
import { typeDecimal } from '@wcpos/components/lib/decimal-entry';
import { cn } from '@wcpos/components/lib/utils';
import { amountFigure } from '@wcpos/components/amount-figure';
import { Text } from '@wcpos/components/text';
import { fromMinor, toMinor } from '@wcpos/order-math';
import { useDocField } from '@wcpos/query';

import { useAppState } from '../../../../contexts/app-state';
import { useSessionReport } from '../../../../services/register-session/use-session-report';
import { useT } from '../../../../contexts/translations';
import {
	isServerDecimal,
	movementFieldError,
	type MovementType,
	normalizeAmount,
} from '../../../../services/register-session/movement-input';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { type CurrencyFormatOptions, useCurrencyFormat } from '../../hooks/use-currency-format';
import { useExclusive } from '../../hooks/use-exclusive';
import { usePanelSide } from '../contexts/overlay-side';

/** The figure typed in place: the amount figure's hero step on the input itself. */
const HERO = amountFigure({ size: 'hero' });

export function RegisterAmount({
	currencyOptions,
	variant = 'underline',
	...props
}: {
	currencyOptions?: CurrencyFormatOptions;
	/**
	 * `box`: one framed field with the currency inside it (the closed register). `hero`: no frame,
	 * the figure on the surface with the currency beside it (the movement sheet). The counts keep
	 * the underline.
	 */
	variant?: 'underline' | 'box' | 'hero';
	value: string;
	onChangeText: (v: string) => void;
	testID: string;
	ref?: React.Ref<TextInputInstance>;
}) {
	const { prefix, suffix, format } = useCurrencyFormat(currencyOptions);
	if (variant === 'hero') {
		// The locale's own zero, without the symbol that already sits beside it.
		const zero = format(0).replace(prefix, '').replace(suffix, '').trim();
		// The field hugs the figure so the symbol stays beside it: an invisible copy of the text
		// sizes the box and the input fills it, on web and native alike.
		return (
			<View className="h-tile flex-row items-center self-start">
				{!!prefix && <Text className={cn(HERO, 'text-muted-foreground')}>{prefix}</Text>}
				<View className="justify-center">
					<Text aria-hidden className={cn(HERO, 'pr-1 opacity-0')}>
						{props.value || zero}
					</Text>
					<Input.Root className="web:ring-0 absolute inset-0 h-full border-0 bg-transparent">
						<Input.InputField
							{...props}
							type="decimal"
							placeholder={zero}
							className={cn(HERO, 'px-0 py-0')}
						/>
					</Input.Root>
				</View>
				{!!suffix && <Text className={cn(HERO, 'text-muted-foreground')}>{suffix}</Text>}
			</View>
		);
	}
	if (variant === 'box') {
		return (
			<Input.Root className="h-tile">
				{!!prefix && (
					<Input.Left>
						<Text className="text-amt text-muted-foreground tabular-nums">{prefix}</Text>
					</Input.Left>
				)}
				<Input.InputField {...props} type="decimal" className="text-amt tabular-nums" />
				{!!suffix && (
					<Input.Right className="pr-3">
						<Text className="text-amt text-muted-foreground tabular-nums">{suffix}</Text>
					</Input.Right>
				)}
			</Input.Root>
		);
	}
	return (
		<View className="min-h-row border-border flex-row items-center self-start border-b">
			{!!prefix && <Text className="text-amt tabular-nums">{prefix}</Text>}
			<Input
				{...props}
				type="decimal"
				className="h-tile w-40"
				inputClassName="text-amt tabular-nums"
			/>
			{!!suffix && <Text className="text-amt tabular-nums">{suffix}</Text>}
		</View>
	);
}

/** The store's common reasons, as chips; "Other…" clears the field and focuses it. */
const REASONS: Record<MovementType, string[]> = {
	paid_out: ['supplier', 'petty_cash', 'bank', 'tips', 'change'],
	paid_in: ['float', 'change', 'bank'],
	no_sale: ['change', 'mistake', 'drawer_check'],
};
/** Where the "after" figure sits in the one translated consequence line, so it can be bold. */
const AFTER_MARK = '\u0001';

export function MovementSheet({
	type,
	onDone,
	onOpenChange,
}: {
	type: MovementType | null;
	onDone: (id: string, type: MovementType, amount: string) => void;
	onOpenChange: (open: boolean) => void;
}) {
	const { actions, expected, blind } = useRegisterSession();
	const { openDrawer } = useSessionReport();
	const { format } = useCurrencyFormat();
	const [amount, setAmount] = React.useState('');
	const [reason, setReason] = React.useState('');
	// Two taps before a render must not mint two paid-out rows.
	const { busy, exclusive } = useExclusive();
	const noteRef = React.useRef<TextInputInstance>(null);
	const [error, setError] = React.useState('');
	const t = useT();
	const words: Record<string, string> = {
		paid_in: t('register.question_paid_in'),
		paid_out: t('register.question_paid_out'),
		no_sale: t('register.question_no_sale'),
		amount: t('register.movement_needs_amount'),
		reason: t('register.movement_needs_reason'),
		supplier: t('register.reason_supplier'),
		petty_cash: t('register.reason_petty_cash'),
		bank: t('register.reason_bank'),
		tips: t('register.reason_tips'),
		change: t('register.reason_change'),
		float: t('register.reason_float'),
		mistake: t('register.reason_mistake'),
		drawer_check: t('register.reason_drawer_check'),
		other: t('register.reason_other'),
	};
	const side = usePanelSide('cart');
	// The cash moves the moment the cashier confirms, so the only safe place to catch an input
	// the server will refuse is before the tap — a 400 afterwards loses the money silently.
	const invalid = type ? movementFieldError({ type, amount, reason }) : 'amount';
	const typed = normalizeAmount(amount);
	const hasAmount = type !== 'no_sale' && isServerDecimal(typed) && Number(typed) > 0;
	const figure = format(Number(typed));
	// What the drawer holds once this movement lands, in minor units: never float arithmetic.
	const drawer = toMinor(expected.cash, 4);
	const delta = (type === 'paid_in' ? 1 : -1) * toMinor(typed, 4);
	const after = format(Number(fromMinor(drawer + delta, 4)));
	const holds = format(Number(fromMinor(drawer, 4)));
	const [beforeAfter, afterTail = ''] = t('register.in_the_drawer_after', {
		drawer: holds,
		after: AFTER_MARK,
	}).split(AFTER_MARK);
	// The store's separator and places; the state keeps a point (`normalizeAmount` reads `1,500` as 1500).
	const { store } = useAppState();
	const separator = (useDocField(store, (value) => value.price_decimal_sep) as string) || '.';
	const places = Number(useDocField(store, (value) => value.price_num_decimals) ?? 2);
	const keypadRows = [
		...DIGIT_ROWS,
		decimalRow(places > 0 ? separator : undefined, t('common.backspace')),
	];
	// The keypad and the hardware keyboard edit the same string.
	const press = (key: string) => setAmount((prev) => typeDecimal(prev, key, places));
	let verb = t('register.open_the_drawer');
	if (type === 'paid_in') {
		verb = hasAmount ? t('register.put_in', { amount: figure }) : t('register.put_cash_in');
	} else if (type === 'paid_out') {
		verb = hasAmount ? t('register.take_out', { amount: figure }) : t('register.take_cash_out');
	}
	const runConfirm = async () => {
		if (!type || invalid) return;
		const normalized = type === 'no_sale' ? '0' : normalizeAmount(amount);
		// Send exactly what was validated. The length check is on the trimmed reason, so 500
		// characters and a trailing space passes here and 400s on arrival if sent raw.
		const trimmedReason = reason.trim();
		try {
			const row = await actions.recordMovement({ type, amount: normalized, reason: trimmedReason });
			onDone(row.id, type, normalized);
			if (type === 'no_sale') await openDrawer();
			onOpenChange(false);
		} catch (e) {
			setError(String(e));
		}
	};
	const confirm = () => exclusive('confirm', runConfirm);
	return (
		<Dialog open={!!type} onOpenChange={onOpenChange}>
			<DialogContent side={side} size="lg" portalHost="pos">
				<DialogHeader>
					<DialogTitle>{type ? words[type] : ''}</DialogTitle>
				</DialogHeader>
				{/* Taps on the keypad and chips must land while the note's keyboard is up (native). */}
				<DialogBody className="gap-3" keyboardShouldPersistTaps="handled">
					{type !== 'no_sale' && (
						<RegisterAmount
							variant="hero"
							testID="movement-amount"
							value={amount.replace('.', separator)}
							onChangeText={(value) => setAmount(value.replace(separator, '.'))}
						/>
					)}
					{/* The consequence, said once: what the drawer holds, and what it will after. */}
					{!blind && (
						<Text testID="movement-after" className="text-muted-foreground text-sm tabular-nums">
							{hasAmount ? (
								<>
									{beforeAfter}
									<Text className="text-foreground text-sm font-semibold tabular-nums">
										{after}
										{afterTail}
									</Text>
								</>
							) : (
								t('register.drawer_holds', { drawer: holds })
							)}
						</Text>
					)}
					<View className="flex-row flex-wrap gap-2">
						{type &&
							[...REASONS[type], 'other'].map((key) => {
								const label = words[key];
								const other = key === 'other';
								return (
									<Chip
										key={key}
										label={label}
										on={!other && reason === label}
										testID={`movement-reason-${key.replace(/_/g, '-')}`}
										onPress={() => {
											if (other) noteRef.current?.focus();
											setReason(other || reason === label ? '' : label);
										}}
									/>
								);
							})}
					</View>
					<Input
						ref={noteRef}
						testID="movement-reason"
						placeholder={t('register.reason')}
						value={reason}
						onChangeText={setReason}
					/>
					{!!invalid && (
						<Text testID="movement-invalid" className="text-muted-foreground text-sm">
							{words[invalid]}
						</Text>
					)}
					{!!error && <Text className="text-bad text-sm">{error}</Text>}
					{type !== 'no_sale' && (
						<Keypad rows={keypadRows} onPress={press} fit="tile" testID="movement" />
					)}
				</DialogBody>
				<DialogFooter
					size="lg"
					intent={{
						label: verb,
						testID: 'movement-confirm',
						loading: busy,
						disabled: !!invalid,
						onPress: () => void confirm(),
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}
