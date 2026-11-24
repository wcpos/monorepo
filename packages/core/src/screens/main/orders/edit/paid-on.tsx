import * as React from 'react';
import { View } from 'react-native';

import { format } from 'date-fns/format';
import { parseISO } from 'date-fns/parseISO';
import { set } from 'date-fns/set';
import { useForm, useWatch } from 'react-hook-form';

import { Badge } from '@wcpos/components/badge';
import { Button } from '@wcpos/components/button';
import { DayCalendar } from '@wcpos/components/calendar';
import { FieldBox } from '@wcpos/components/field-box';
import { Form } from '@wcpos/components/form';
import { Icon } from '@wcpos/components/icon';
import { useIsPhone } from '@wcpos/components/lib/device';
import { useSpacingUnit } from '@wcpos/components/lib/use-spacing-unit';
import { Notice } from '@wcpos/components/notice';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/popover';
import { PropertyRow, PropertyVerb } from '@wcpos/components/property-row';
import { Text } from '@wcpos/components/text';
import { Textarea } from '@wcpos/components/textarea';
import type { OrderPayload } from '@wcpos/query';
import { rungUpMomentOf } from '@wcpos/query/query-state';
import { wooMetaCarrier } from '@wcpos/sync-core';

import { useT } from '../../../../contexts/translations';
import { useLocale } from '../../../../hooks/use-locale';
import { convertUTCStringToLocalDate, useLocalDate } from '../../../../hooks/use-local-date';
import { calendarDate, inZone, useStoreDay, zoneOptions } from '../../../../hooks/use-store-day';
import { useCashierLabel } from '../../hooks/use-cashier-label';
import { useServerFeature } from '../../hooks/use-server-feature';
import { useUserCapabilities } from '../../hooks/use-user-capabilities';

type Props = {
	payload: OrderPayload;
	busy: boolean;
	onMove: (
		atGmt: string,
		reason: string,
		success: string
	) => Promise<'applied' | 'refused' | 'pending' | undefined>;
};

/** A UTC instant in the server's form, never later than this second. */
const notAfterNow = (time: number) =>
	new Date(Math.min(time, Math.floor(Date.now() / 1000) * 1000))
		.toISOString()
		.replace('.000Z', 'Z');

export function PaidOn(props: Props) {
	// Suppress the creation-date fallback: this fact exists only when money was taken at the POS.
	const rungUp = rungUpMomentOf({ ...props.payload, date_created_gmt: undefined });
	// The store corrects a standing sale only: an order awaiting payment again has none.
	const open = ['pos-open', 'pos-partial', 'pending', 'on-hold', 'failed', 'cancelled'].includes(
		props.payload.status ?? ''
	);
	return rungUp && !open && wooMetaCarrier.readIdentity(props.payload.meta_data).cashierId ? (
		<PaidOnRow {...props} rungUp={rungUp} />
	) : null;
}

function PaidOnRow({ payload, busy, onMove, rungUp }: Props & { rungUp: string }) {
	const t = useT();
	const phone = useIsPhone();
	const { shortCode } = useLocale();
	const { dateFnsLocale: locale } = useLocalDate();
	const storeId = wooMetaCarrier.readIdentity(payload.meta_data).storeId;
	const { timezone, dayBounds } = useStoreDay(storeId == null ? undefined : Number(storeId));
	const options = { ...zoneOptions(timezone), locale };
	const moment = (at: string) => inZone(timezone, convertUTCStringToLocalDate(at));
	const dayOf = (at: string) => format(moment(at), 'yyyy-MM-dd');
	const dayLabel = (day: string, short = false) =>
		format(parseISO(day), short ? 'EEE d MMM' : 'EEE d MMM yyyy', { locale });
	const correction = wooMetaCarrier.readSaleDay(payload.meta_data);
	const request = wooMetaCarrier.readSaleDayRequest(payload.meta_data);
	const pending =
		!!request && request.atGmt !== correction?.atGmt && request.from === (correction?.atGmt ?? '');
	const countedAt = correction?.atGmt ?? rungUp;
	const currentDay = dayOf(countedAt);
	const { label: movedBy } = useCashierLabel(correction?.by);
	const knownName =
		correction?.by != null &&
		movedBy &&
		movedBy !== t('common.cashier_number', { id: correction.by });
	const { canReassignSales } = useUserCapabilities().caps;
	const supported = useServerFeature('order_sale_day_correction');
	const locked = !canReassignSales
		? { where: t('orders.set_at_sale') }
		: !supported
			? { where: t('orders.sale_day_needs_plugin') }
			: undefined;
	const [editing, setEditing] = React.useState(false);
	const [calendarOpen, setCalendarOpen] = React.useState(false);
	const trigger = React.useRef<React.ComponentRef<typeof PopoverTrigger>>(null);
	const unit = useSpacingUnit();
	const [refused, setRefused] = React.useState(false);
	const waiting = pending && !refused;
	const form = useForm({ defaultValues: { day: '', reason: '' } });
	const day = useWatch({ control: form.control, name: 'day' });
	const reason = useWatch({ control: form.control, name: 'reason' });
	const sending = form.formState.isSubmitting;
	const ready = !!day && day !== currentDay && !!reason.trim();
	const submit = form.handleSubmit(async ({ day, reason }) => {
		if (!ready || busy || locked) return;
		const clock = moment(rungUp);
		const picked = set(
			inZone(timezone, dayBounds(calendarDate(parseISO(day))).from),
			{
				hours: clock.getHours(),
				minutes: clock.getMinutes(),
				seconds: clock.getSeconds(),
				milliseconds: 0,
			},
			options
		);
		// Today at a clock time still ahead is not a moment a sale can have been paid: the store refuses the future.
		const atGmt = notAfterNow(picked.getTime());
		const result = await onMove(
			atGmt,
			reason.trim(),
			t('orders.sale_moved_to_day', { day: dayLabel(day, true) })
		);
		if (result) setEditing(false);
		setRefused(result === 'refused');
	});
	const verb = (
		<PropertyVerb
			testID="order-edit-change-day"
			disabled={busy || sending || pending}
			onPress={() => {
				if (pending) return;
				form.reset({ day: '', reason: '' });
				setRefused(false);
				setEditing(true);
			}}
		>
			{t('orders.change_sale_day')}
		</PropertyVerb>
	);

	if (editing)
		return (
			<Form {...form}>
				<Notice
					testID="order-paid-on-card"
					tone="info"
					icon={null}
					live={false}
					title={t('orders.move_sale_day_title')}
				>
					<PropertyRow label={t('orders.sale_day_from')}>{dayLabel(currentDay)}</PropertyRow>
					<PropertyRow label={t('orders.sale_day_to')} align="top">
						<View className="gap-1">
							<Popover onOpenChange={setCalendarOpen}>
								<PopoverTrigger
									ref={trigger}
									testID="order-paid-on-day"
									disabled={sending}
									accessibilityLabel={t('orders.sale_day_to')}
								>
									<FieldBox
										state={calendarOpen ? 'open' : 'rest'}
										empty={!day}
										className="gap-2 px-3"
									>
										<Icon name="calendar" className="text-muted-foreground" />
										<Text>{day ? dayLabel(day) : t('orders.sale_day_pick')}</Text>
									</FieldBox>
								</PopoverTrigger>
								{/* Anchored to its field: below it, or above when the pane has no room, a gutter clear of the screen. */}
								<PopoverContent
									side="bottom"
									align="start"
									insets={{ top: 4 * unit, bottom: 4 * unit, left: 4 * unit, right: 4 * unit }}
								>
									<DayCalendar
										value={day || undefined}
										onValueChange={(value) => {
											form.setValue('day', value);
											trigger.current?.close();
										}}
										maxDate={format(new Date(), 'yyyy-MM-dd', options)}
										currentDay={currentDay}
										currentDayLabel={t('orders.sale_day_current')}
										locale={shortCode}
										testID="order-paid-on"
									/>
									<View className="flex-row items-center gap-3 p-3">
										<View className="bg-primary size-1 rounded-full" />
										<Text className="text-muted-foreground">{t('orders.sale_day_current')}</Text>
									</View>
								</PopoverContent>
							</Popover>
							<Text variant="help">{t('orders.sale_day_reports_hint')}</Text>
						</View>
					</PropertyRow>
					<PropertyRow label={t('orders.sale_day_reason')} align="top">
						<Textarea
							testID="order-paid-on-reason"
							value={reason}
							onChangeText={(value) => form.setValue('reason', value)}
							editable={!sending}
							accessibilityLabel={t('orders.sale_day_reason')}
							maxLength={500}
							placeholder={t('common.add_value', { label: t('orders.sale_day_reason') })}
						/>
					</PropertyRow>
					<Text variant="help">
						{day && !reason.trim() ? t('orders.sale_day_reason_required') : ' '}
					</Text>
					<View className={phone ? 'flex-col-reverse gap-2' : 'flex-row justify-end gap-2'}>
						<Button
							testID="order-paid-on-cancel"
							variant="ghost"
							disabled={sending}
							onPress={() => setEditing(false)}
						>
							{t('common.cancel')}
						</Button>
						<Button
							testID="order-paid-on-move"
							loading={sending}
							disabled={!ready || busy || sending || !!locked}
							onPress={() => void submit()}
						>
							{day
								? t('orders.move_sale_to_day', { day: dayLabel(day, true) })
								: t('orders.move_sale')}
						</Button>
					</View>
				</Notice>
			</Form>
		);

	return (
		<>
			<PropertyRow
				id="paid_on"
				label={t('orders.paid_on')}
				locked={locked}
				verb={!locked ? verb : undefined}
			>
				<View className="flex-row flex-wrap items-center gap-1">
					<Text>{dayLabel(currentDay)}</Text>
					{correction && currentDay < dayOf(rungUp) ? (
						<Badge variant="info" tinted>
							{t('reports.rung_up_later')}
						</Badge>
					) : null}
				</View>
			</PropertyRow>
			{/* Under the value, not the key: the dialog's key column (32) and its gap (3). */}
			<View className={phone ? 'gap-2' : 'ml-35 gap-2'}>
				{correction ? (
					<View testID="order-paid-on-audit" className="gap-2 pb-2">
						<Text className="text-muted-foreground">
							{t('orders.sale_day_rung_up', {
								date: format(moment(rungUp), 'EEE d MMM yyyy, HH:mm', { locale }),
							})}
						</Text>
						<Text className="text-muted-foreground">
							{knownName
								? t('orders.sale_day_moved_by', { name: movedBy, reason: correction.reason })
								: t('orders.sale_day_moved', { reason: correction.reason })}
						</Text>
					</View>
				) : null}
				{pending || refused ? (
					<View
						testID={waiting ? 'order-paid-on-waiting' : 'order-paid-on-refused'}
						className="flex-row items-start gap-2 pb-2"
					>
						<Icon
							name={waiting ? 'pending' : 'alert'}
							className={waiting ? 'text-muted-foreground' : 'text-bad'}
						/>
						<Text
							className={
								waiting ? 'text-muted-foreground min-w-0 flex-1' : 'text-bad min-w-0 flex-1'
							}
						>
							{waiting
								? t('orders.sale_day_waiting', { day: dayLabel(dayOf(request.atGmt), true) })
								: t('orders.sale_day_refused')}
						</Text>
					</View>
				) : null}
			</View>
		</>
	);
}
