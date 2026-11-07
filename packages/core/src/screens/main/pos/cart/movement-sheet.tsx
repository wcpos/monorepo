import * as React from 'react';
import { type TextInputInstance } from 'react-native';

import { Chip } from '@wcpos/components/chip';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Input } from '@wcpos/components/input';
import { decimalRow, DIGIT_ROWS, Keypad } from '@wcpos/components/keypad';
import { typeDecimal } from '@wcpos/components/lib/decimal-entry';
import { useIsPhone } from '@wcpos/components/lib/device';
import { cn } from '@wcpos/components/lib/utils';
import { amountFigure } from '@wcpos/components/amount-figure';
import { PressableSurface } from '@wcpos/components/pressable-surface';
import { Text } from '@wcpos/components/text';
import { TileGrid } from '@wcpos/components/tile-grid';
import { useMergedRef } from '@wcpos/hooks/use-merged-ref';
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

/** The figure typed in place: the amount figure's hero step on the input itself. */
const HERO = amountFigure({ size: 'hero' });
const SYMBOL = 'text-2xl text-muted-foreground tabular-nums';

/** One framed figure for every editable register amount. */
export function RegisterAmount({
	currencyOptions,
	ref,
	...props
}: {
	currencyOptions?: CurrencyFormatOptions;
	value: string;
	onChangeText: (v: string) => void;
	testID: string;
	ref?: React.Ref<TextInputInstance>;
} & Pick<
	React.ComponentProps<typeof Input.InputField> & React.AriaAttributes,
	'onBlur' | 'onFocus' | 'onPressIn' | 'aria-invalid' | 'aria-describedby'
>) {
	const { prefix, suffix, format } = useCurrencyFormat(currencyOptions);
	// The locale's own zero, without the symbol that already sits beside it.
	const zero = format(0).replace(prefix, '').replace(suffix, '').trim();
	const inputRef = React.useRef<TextInputInstance>(null);
	const mergedRef = useMergedRef(ref ?? null, inputRef);
	// The symbol sits inside the field's border, so a tap on it is a tap on the field (as the
	// Input's own leading glyph): it focuses the numerals rather than being a dead strip.
	const symbol = (text: string) => (
		<PressableSurface
			wash="none"
			accessible={false}
			tabIndex={-1}
			testID={`${props.testID}-symbol`}
			onPress={() => inputRef.current?.focus()}
		>
			<Text className={SYMBOL}>{text}</Text>
		</PressableSurface>
	);
	return (
		<Input.Root figure>
			{!!prefix && <Input.Left>{symbol(prefix)}</Input.Left>}
			<Input.InputField
				{...props}
				ref={mergedRef}
				type="decimal"
				placeholder={zero}
				className={cn(HERO, 'placeholder:font-normal', !!prefix && 'pl-1.5', !!suffix && 'pr-1.5')}
			/>
			{!!suffix && <Input.Right className="pr-3">{symbol(suffix)}</Input.Right>}
		</Input.Root>
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
	side: sideProp,
	portalHost = 'pos',
	type,
	onDone,
	onOpenChange,
}: {
	side?: 'left' | 'right';
	portalHost?: string | null;
	type: MovementType | null;
	onDone: (id: string, type: MovementType, amount: string) => void;
	onOpenChange: (open: boolean) => void;
}) {
	const { actions, expected, blind, binding } = useRegisterSession();
	const phone = useIsPhone();
	const invalidId = React.useId();
	const { openDrawer } = useSessionReport();
	const { format } = useCurrencyFormat();
	const [amount, setAmount] = React.useState('');
	const [reason, setReason] = React.useState('');
	// Two taps before a render must not mint two paid-out rows.
	const { busy, exclusive } = useExclusive();
	const noteRef = React.useRef<TextInputInstance>(null);
	const [error, setError] = React.useState('');
	// A no-sale already recorded when its drawer refused: the retry only opens the drawer (#2001).
	const noSaleRecorded = React.useRef(false);
	const t = useT();
	const words: Record<string, string> = {
		paid_in: t('register.question_paid_in'),
		paid_out: t('register.question_paid_out'),
		no_sale: t('register.question_no_sale'),
		title_paid_in: t('register.paid_in'),
		title_paid_out: t('register.paid_out'),
		title_no_sale: t('register.no_sale'),
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
	// Pay in / pay out open from the right unless their opener says otherwise (Paul 2026-10-30).
	const side = sideProp ?? 'right';
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
			if (!noSaleRecorded.current) {
				const row = await actions.recordMovement({
					type,
					amount: normalized,
					reason: trimmedReason,
				});
				onDone(row.id, type, normalized);
			}
			if (type === 'no_sale') {
				noSaleRecorded.current = true;
				await openDrawer();
			}
			onOpenChange(false);
		} catch (e) {
			setError(String(e));
		}
	};
	const confirm = () => exclusive('confirm', runConfirm);
	return (
		<Dialog open={!!type} onOpenChange={onOpenChange}>
			<DialogContent side={side} size="lg" portalHost={portalHost}>
				<DialogHeader>
					<DialogTitle>{type ? words[`title_${type}`] : ''}</DialogTitle>
					{/* The consequence, said once: what the drawer holds, and what it will after. */}
					{!blind && (
						<DialogDescription testID="movement-after">
							{binding.registerName} ·{' '}
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
						</DialogDescription>
					)}
				</DialogHeader>
				{/* Taps on the keypad and chips must land while the note's keyboard is up (native). */}
				<DialogBody className="gap-3" keyboardShouldPersistTaps="handled">
					<Text variant="section">{type ? words[type] : ''}</Text>
					{type !== 'no_sale' && (
						<>
							<RegisterAmount
								testID="movement-amount"
								aria-invalid={invalid === 'amount'}
								aria-describedby={invalid === 'amount' ? invalidId : undefined}
								value={amount.replace('.', separator)}
								onChangeText={(value) => setAmount(value.replace(separator, '.'))}
							/>
							<Keypad
								rows={keypadRows}
								onPress={press}
								fit={phone ? 'shrink' : 'tile'}
								testID="movement"
							/>
						</>
					)}
					<Text className="text-muted-foreground">{t('register.reason')}</Text>
					<TileGrid columns={phone ? 2 : 3}>
						{type &&
							[...REASONS[type], 'other'].map((key) => {
								const label = words[key];
								const other = key === 'other';
								return (
									<Chip
										key={key}
										className="justify-center self-stretch"
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
					</TileGrid>
					<Input
						ref={noteRef}
						testID="movement-reason"
						aria-invalid={invalid === 'reason'}
						aria-describedby={invalid === 'reason' ? invalidId : undefined}
						placeholder={t('register.reason')}
						value={reason}
						onChangeText={setReason}
					/>
					{!!error && <Text className="text-bad text-sm">{error}</Text>}
				</DialogBody>
				<DialogFooter
					size="lg"
					aside={
						!!invalid && (
							<HStack className="items-center gap-1">
								<Icon name="info" size="sm" className="text-muted-foreground" />
								<Text
									testID="movement-invalid"
									nativeID={invalidId}
									className="text-muted-foreground"
								>
									{words[invalid]}
								</Text>
							</HStack>
						)
					}
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
