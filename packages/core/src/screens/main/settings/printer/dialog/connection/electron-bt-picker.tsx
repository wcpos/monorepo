import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { SavedMark } from '@wcpos/components/form';
import { Button } from '@wcpos/components/button';
import { ListItem } from '@wcpos/components/list-item';
import { Text } from '@wcpos/components/text';
import type { BluetoothCandidate } from '@wcpos/printer';

import { useT } from '../../../../../../contexts/translations';

/** Names receipt printers advertise: vendor names, model prefixes and the generic "printer". */
const PRINTER_NAME_PATTERN =
	/print|receipt|\bpos\b|\btm-|\bmtp|\bpt-|epson|star|bixolon|netum|xprinter|goojprt|munbyn|rongta|zjiang|gprinter|sunmi|iposprinter|thermal/i;

export function rankBluetoothCandidates(candidates: BluetoothCandidate[]) {
	const likely = candidates.filter((d) => PRINTER_NAME_PATTERN.test(d.name));
	const named = candidates.filter((d) => d.name && !PRINTER_NAME_PATTERN.test(d.name));
	const unnamed = candidates.filter((d) => !d.name);
	return { likely, named, unnamed };
}

/** Chooser candidates forwarded from the Electron main process. Dumb list — the
 * discovery hook owns the IPC subscription and session lifecycle. Printer-like names
 * lead, other named devices follow, unnamed devices hide behind a toggle: a shop
 * floor shows dozens of phones and beacons and one printer. */
export function ElectronBtPicker({
	candidates,
	onSelect,
}: {
	candidates: BluetoothCandidate[];
	onSelect: (id: string) => void;
}) {
	const t = useT();
	const [showUnnamed, setShowUnnamed] = React.useState(false);
	if (candidates.length === 0) return null;
	const { likely, named, unnamed } = rankBluetoothCandidates(candidates);
	const item = (d: BluetoothCandidate, isLikely: boolean) => (
		<ListItem
			key={d.id}
			testID={`electron-bt-device-${d.id}`}
			onPress={() => onSelect(d.id)}
			leading={
				<View
					className={`size-2 rounded-full ${isLikely ? 'bg-primary' : 'bg-muted-foreground'}`}
				/>
			}
			trailing={
				isLikely ? (
					<Text className="text-primary text-xs font-semibold">
						{t('settings.bt_likely_printer')}
					</Text>
				) : null
			}
		>
			<Text className="text-sm">{d.name || d.id}</Text>
		</ListItem>
	);
	return (
		<View className="relative gap-2">
			<View className="pointer-events-none absolute top-0 right-0">
				<SavedMark name="address" label={t('settings.saved')} />
			</View>
			{/* An office shows dozens of devices: the list scrolls inside a fixed height so the
			    dialog's own buttons stay in reach. */}
			<ScrollView className="max-h-64" contentContainerClassName="gap-2">
				{likely.map((d) => item(d, true))}
				{named.map((d) => item(d, false))}
				{showUnnamed && unnamed.map((d) => item(d, false))}
			</ScrollView>
			{unnamed.length > 0 && (
				<Button
					variant="link"
					size="sm"
					className="self-start px-0"
					testID="electron-bt-toggle-unnamed"
					onPress={() => setShowUnnamed((v) => !v)}
				>
					<Text>
						{showUnnamed
							? t('settings.bt_hide_unnamed', {
									n: unnamed.length,
								})
							: t('settings.bt_show_unnamed', {
									n: unnamed.length,
								})}
					</Text>
				</Button>
			)}
		</View>
	);
}
