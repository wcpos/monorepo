import * as React from 'react';
import { View } from 'react-native';

import { Dialog, DialogContent } from '@wcpos/components/dialog';
import { EdgeSurface } from '@wcpos/components/edge-surface';
import { useIsPhone } from '@wcpos/components/lib/device';

const BOTTOM = ['bottom'] as const;

/** A Reports panel: a side panel hosted in Reports, on a phone a page in its place (closures ledger 30). */
export function ReportPanel({
	testID,
	wide = false,
	onClose,
	children,
}: React.PropsWithChildren<{ testID: string; wide?: boolean; onClose: () => void }>) {
	const phone = useIsPhone();
	if (phone)
		return (
			<EdgeSurface testID={testID} edges={BOTTOM} className="bg-card min-h-0 flex-1">
				<View className="min-h-0 flex-1 gap-4 py-4">{children}</View>
			</EdgeSurface>
		);
	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent side="right" size={wide ? 'xl' : 'lg'} portalHost="reports" testID={testID}>
				{children}
			</DialogContent>
		</Dialog>
	);
}
