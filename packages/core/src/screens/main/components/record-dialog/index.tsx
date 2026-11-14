import * as React from 'react';
import { View } from 'react-native';

import {
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DismissIsClose,
} from '@wcpos/components/dialog';
import { EmptyState } from '@wcpos/components/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';
import { Tree } from '@wcpos/components/tree';

import { useT } from '../../../../contexts/translations';

export type RecordTab<R> = { value: string; label: string; render: (record: R) => React.ReactNode };

export interface RecordDialogProps<R> {
	/** The heading. Every caller builds it from a server-supplied name, so it is decoded here. */
	title: string;
	/** The record; null when it is not on the device, and the body is then `notFound`. */
	record: R | null | undefined;
	notFound?: string;
	/** The record's one tab (Form), or its tabs when it has more than one (an order's View and Edit). JSON follows unless `json` is false. */
	form: ((record: R) => React.ReactNode) | RecordTab<R>[];
	/** The tab to open on; one the dialog does not show falls back to the first. */
	initialTab?: string;
	/** What the JSON tab shows. */
	payload?: object;
	/** false drops the JSON tab (the cart's Order details); with one tab left the form fills the sheet with no tab bar. */
	json?: boolean;
	/** A `DialogFooter` (its slots decide the buttons), under the tabs. */
	footer?: React.ReactNode;
	/** `right` on a page; on the POS, `usePanelSide`. */
	side?: 'left' | 'right';
	testID?: string;
}

/** The one shell of a record edit: side panel, title, the record's tabs then JSON unless `json` is false, or not-found. */
export function RecordDialog<R>({
	title,
	record,
	notFound,
	form,
	initialTab,
	payload,
	json = true,
	footer,
	side = 'right',
	testID,
}: RecordDialogProps<R>) {
	const t = useT();
	const tabs = Array.isArray(form)
		? form
		: [{ value: 'form', label: t('common.form'), render: form }];
	const [value, setValue] = React.useState(() =>
		(json && initialTab === 'json') || tabs.some((tab) => tab.value === initialTab)
			? (initialTab as string)
			: tabs[0].value
	);

	return (
		// One size for every record panel: the larger of the two in use (LEDGER line 1).
		<DialogContent side={side} size="xl" testID={testID}>
			<DialogHeader>
				<DialogTitle>
					<Text decodeHtml>{title}</Text>
				</DialogTitle>
			</DialogHeader>
			{record == null ? (
				<EmptyState kind="empty" title={notFound ?? title} testID="record-dialog-not-found" />
			) : (
				<DismissIsClose>
					<View className="min-h-0 flex-1">
						{!json && tabs.length === 1 ? (
							tabs[0].render(record)
						) : (
							<Tabs className="min-h-0 flex-1" value={value} onValueChange={setValue}>
								<TabsList className="mx-4 flex-row">
									{tabs.map((tab) => (
										<TabsTrigger key={tab.value} value={tab.value} className="flex-1">
											<Text>{tab.label}</Text>
										</TabsTrigger>
									))}
									{json && (
										<TabsTrigger value="json" className="flex-1">
											<Text>{t('common.json')}</Text>
										</TabsTrigger>
									)}
								</TabsList>
								{tabs.map((tab) => (
									<TabsContent key={tab.value} value={tab.value} className="min-h-0 flex-1">
										{tab.render(record)}
									</TabsContent>
								))}
								{json && (
									<TabsContent value="json" className="min-h-0 flex-1">
										<DialogBody>
											<Tree value={payload} />
										</DialogBody>
									</TabsContent>
								)}
							</Tabs>
						)}
					</View>
					{footer}
				</DismissIsClose>
			)}
		</DialogContent>
	);
}
