import * as React from 'react';
import { View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsPhone } from '@wcpos/components/lib/device';
import { Dialog, DialogContent } from '@wcpos/components/dialog';

/** A Reports panel: a side panel hosted in Reports, on a phone a page in its place (closures ledger 30). */
export function ReportPanel({
	testID,
	wide = false,
	onClose,
	children,
}: React.PropsWithChildren<{ testID: string; wide?: boolean; onClose: () => void }>) {
	const phone = useIsPhone();
	const { bottom } = useSafeAreaInsets();
	if (phone)
		return (
			<View testID={testID} className="bg-card min-h-0 flex-1" style={{ paddingBottom: bottom }}>
				<View className="min-h-0 flex-1 gap-4 py-4">{children}</View>
			</View>
		);
	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent side="right" size={wide ? 'xl' : 'lg'} portalHost="reports" testID={testID}>
				{children}
			</DialogContent>
		</Dialog>
	);
}
