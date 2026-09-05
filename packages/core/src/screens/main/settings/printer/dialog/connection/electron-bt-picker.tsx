import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@wcpos/components/button';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
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
		<Pressable
			key={d.id}
			testID={`electron-bt-device-${d.id}`}
			onPress={() => onSelect(d.id)}
			className={`flex-row items-center gap-2 rounded-md border p-2 ${
				isLikely ? 'border-primary bg-primary/5' : 'border-border'
			}`}
		>
			<View className={`h-2 w-2 rounded-full ${isLikely ? 'bg-primary' : 'bg-muted-foreground'}`} />
			<Text className="flex-1 text-sm">{d.name || d.id}</Text>
			{isLikely && (
				<Text className="text-primary text-xs font-semibold">
					{t('settings.bt_likely_printer')}
				</Text>
			)}
		</Pressable>
	);
	return (
		<VStack className="gap-2">
			{likely.map((d) => item(d, true))}
			{named.map((d) => item(d, false))}
			{showUnnamed && unnamed.map((d) => item(d, false))}
			{unnamed.length > 0 && (
				<Button
					variant="link"
					size="sm"
					className="self-start px-0"
					testID="electron-bt-toggle-unnamed"
					onPress={() => setShowUnnamed((v) => !v)}
				>
					<Text>
						{t(showUnnamed ? 'settings.bt_hide_unnamed' : 'settings.bt_show_unnamed', {
							n: unnamed.length,
						})}
					</Text>
				</Button>
			)}
		</VStack>
	);
}
