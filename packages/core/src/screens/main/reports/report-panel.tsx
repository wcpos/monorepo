import * as React from 'react';
import { View } from 'react-native';

import { Dialog, DialogContent } from '@wcpos/components/dialog';
import { EdgeSurface } from '@wcpos/components/edge-surface';
import { useIsPhone } from '@wcpos/components/lib/device';

import { usePageSheetHost } from '../components/page-sheet-host';

const BOTTOM = ['bottom'] as const;

/** A Reports panel: a side panel on the page host, beside the rail and over the page bar; on a phone a page in its place. */
export function ReportPanel({
	testID,
	wide = false,
	onClose,
	children,
}: React.PropsWithChildren<{ testID: string; wide?: boolean; onClose: () => void }>) {
	const phone = useIsPhone();
	const host = usePageSheetHost();
	if (phone)
		return (
			<EdgeSurface testID={testID} edges={BOTTOM} className="bg-card min-h-0 flex-1">
				<View className="min-h-0 flex-1 gap-4 py-4">{children}</View>
			</EdgeSurface>
		);
	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent side="right" size={wide ? 'xl' : 'lg'} portalHost={host} testID={testID}>
				{children}
			</DialogContent>
		</Dialog>
	);
}
