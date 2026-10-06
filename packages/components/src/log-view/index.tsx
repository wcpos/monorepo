import * as React from 'react';
import { ScrollView, Share, View, type ViewProps } from 'react-native';

import { Platform } from '@wcpos/utils/platform';

import { Button, ButtonText } from '../button';
import { cn } from '../lib/utils';
import { Text } from '../text';

/**
 * A log as a read-only text box: fixed-width columns, one line per event, the ids an event
 * carried as aligned fields under it. On web every line is selectable text, and the Copy
 * button puts the same plain text on the clipboard that a drag-select would. On native the
 * button is Share. Colour never carries a level alone: a warning or an error also says so in
 * the line (owner's sign-off on the drawing, 2026-10-06).
 */

export type LogLevel = 'info' | 'ok' | 'warn' | 'error';
export interface LogLine {
	/** Already formatted: "18:00:05". */
	time: string;
	level?: LogLevel;
	message: string;
	/** Label/value pairs printed under the line: `[['reader', 'rdr_…'], ['payment', '…']]`. */
	fields?: [string, string][];
}
/** The words a level prints as; the caller translates them (`health.logs.level_*`). */
export type LogLevelLabels = Partial<Record<LogLevel, string>>;
export interface LogViewProps extends ViewProps {
	lines: LogLine[];
	/** Label/value pairs printed after the last line: ids that belong to no event yet. */
	trailer?: [string, string][];
	levelLabels?: LogLevelLabels;
	/** Left of the Copy button, above the lines; nothing means no header row. */
	title?: React.ReactNode;
	/** The box scrolls inside itself past this; unset means it grows. */
	maxHeight?: number;
	/** `box` draws a border; `none` is the text on whatever it sits on. */
	frame?: 'box' | 'none';
	/** Labels for the copy control; no label means no control. */
	copyLabel?: string;
	shareLabel?: string;
	/** After a copy or share: `true` when the text left the app, `false` when it was refused. */
	onCopied?: (ok: boolean) => void;
	copyTestID?: string;
}

const LEVEL_WORD: Record<LogLevel, string> = { info: '', ok: 'ok', warn: 'warn', error: 'error' };
// "18:00:05" and two spaces: the column every field line indents to.
const INDENT = ' '.repeat(10);
const levelWord = (level: LogLevel, labels?: LogLevelLabels) =>
	level === 'info' ? '' : (labels?.[level] ?? LEVEL_WORD[level]);
const fieldLines = (fields: [string, string][]) => {
	const width = Math.max(0, ...fields.map(([label]) => label.length));
	return fields.map(([label, value]) => `${INDENT}${label.padEnd(width)}  ${value}`);
};

/** The plain text of a log: what Copy copies and what a bug report pastes. */
export function logToText(
	lines: LogLine[],
	{ trailer = [], levelLabels }: { trailer?: [string, string][]; levelLabels?: LogLevelLabels } = {}
): string {
	const out: string[] = [];
	for (const line of lines) {
		const word = levelWord(line.level ?? 'info', levelLabels);
		out.push(`${line.time}  ${word ? `${word} ` : ''}${line.message}`);
		out.push(...fieldLines(line.fields ?? []));
	}
	out.push(...fieldLines(trailer));
	return out.join('\n');
}

export function LogView({
	lines,
	trailer = [],
	levelLabels,
	title,
	maxHeight,
	frame = 'box',
	copyLabel,
	shareLabel,
	onCopied,
	copyTestID,
	className,
	...props
}: LogViewProps) {
	const text = React.useMemo(
		() => logToText(lines, { trailer, levelLabels }),
		[lines, trailer, levelLabels]
	);
	const copy = copyLabel ? (
		<LogCopyButton
			text={text}
			label={copyLabel}
			shareLabel={shareLabel}
			onCopied={onCopied}
			testID={copyTestID}
		/>
	) : null;
	return (
		<View
			className={cn(
				frame === 'box' && 'border-border bg-card overflow-hidden rounded-lg border',
				className
			)}
			{...props}
		>
			{title || copy ? (
				<View
					className={cn(
						'min-h-row flex-row items-center justify-between gap-2',
						frame === 'box' ? 'border-border bg-muted border-b py-1 pr-1 pl-3' : 'pr-0'
					)}
				>
					{typeof title === 'string' ? (
						<Text className="text-muted-foreground text-xs font-semibold">{title}</Text>
					) : (
						(title ?? <View />)
					)}
					{copy}
				</View>
			) : null}
			<ScrollView
				style={maxHeight ? { maxHeight } : undefined}
				contentContainerClassName={cn('py-1', frame === 'box' && 'px-3')}
				// The lines are the scroll content; a web page scrolls behind it once it reaches the end.
				nestedScrollEnabled
			>
				{lines.map((line, index) => (
					<Line key={`${line.time}-${index}`} line={line} levelLabels={levelLabels} />
				))}
				{trailer.length ? <Fields fields={trailer} /> : null}
			</ScrollView>
		</View>
	);
}

function Line({ line, levelLabels }: { line: LogLine; levelLabels?: LogLevelLabels }) {
	const level = line.level ?? 'info';
	const word = levelWord(level, levelLabels);
	const tint =
		level === 'error'
			? 'bg-destructive/10 border-destructive'
			: level === 'warn'
				? 'bg-warning/10 border-warning'
				: 'border-transparent';
	const tone =
		level === 'error' ? 'text-destructive' : level === 'warn' ? 'text-warning' : 'text-success';
	return (
		<View className={cn('border-l-2 pr-2 pl-1', tint)}>
			{/* Every column is text, separators included: a drag-select on web reads like `logToText`. */}
			<View className="flex-row items-start">
				<Text selectable className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
					{line.time}
					{'  '}
				</Text>
				<Text
					selectable
					className={cn(
						'shrink font-mono text-xs',
						level === 'error' ? 'text-destructive' : 'text-foreground'
					)}
				>
					{word ? <Text className={cn('font-mono text-xs font-bold', tone)}>{word} </Text> : null}
					{line.message}
				</Text>
			</View>
			{line.fields?.length ? <Fields fields={line.fields} /> : null}
		</View>
	);
}

function Fields({ fields }: { fields: [string, string][] }) {
	const width = Math.max(0, ...fields.map(([label]) => label.length));
	return fields.map(([label, value], index) => (
		<View key={`${label}-${index}`} className="flex-row items-start">
			<Text selectable className="text-muted-foreground shrink-0 font-mono text-xs">
				{INDENT}
				{label.padEnd(width)}
				{'  '}
			</Text>
			<Text selectable className="text-foreground shrink font-mono text-xs">
				{value}
			</Text>
		</View>
	));
}

/**
 * Copy on web and Electron (the Clipboard API), Share on native (the share sheet). Renders
 * nothing where neither can work (an insecure web context): a dead button explains nothing.
 */
export function LogCopyButton({
	text,
	label,
	shareLabel,
	onCopied,
	testID,
}: {
	text: string;
	label: string;
	shareLabel?: string;
	onCopied?: (ok: boolean) => void;
	testID?: string;
}) {
	const canCopy = typeof navigator !== 'undefined' && Boolean(navigator.clipboard);
	if (!Platform.isNative && !canCopy) return null;
	const press = async () => {
		try {
			if (Platform.isNative) {
				// A share sheet put away without sharing is neither a copy nor a refusal.
				const result = await Share.share({ message: text });
				if (result.action === Share.dismissedAction) return;
			} else await navigator.clipboard.writeText(text);
			onCopied?.(true);
		} catch {
			onCopied?.(false);
		}
	};
	// The default control height: 44 pt, a touch target on a till.
	return (
		<Button variant="ghost" testID={testID} onPress={() => void press()}>
			<ButtonText>{Platform.isNative ? (shareLabel ?? label) : label}</ButtonText>
		</Button>
	);
}
