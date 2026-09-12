import * as React from 'react';

import { Button } from '@wcpos/components/button';
import { Dialog, DialogContent, DialogTitle } from '@wcpos/components/dialog';
import { Input } from '@wcpos/components/input';
import { Text } from '@wcpos/components/text';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import type { ClosureDocument } from '@wcpos/database';

import { useT } from '../../../../contexts/translations';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';
import { usePOSOverlaySide } from '../contexts/overlay-side';

export function ApproveSheet({
	counted,
	onClosed,
	onOpenChange,
}: {
	counted: Record<string, string>;
	onClosed: (closure: ClosureDocument) => void;
	onOpenChange: (open: boolean) => void;
}) {
	const { session, actions } = useRegisterSession();
	const http = useRestHttpClient();
	const online = useOnlineStatus().status === 'online-website-available';
	const [username, setUsername] = React.useState('');
	const [password, setPassword] = React.useState('');
	const [busy, setBusy] = React.useState(false);
	const [error, setError] = React.useState('');
	const t = useT();
	const side = usePOSOverlaySide();
	const confirm = async () => {
		if (!online || busy || !session) return;
		setBusy(true);
		setError('');
		try {
			const response = await http.post(`sessions/${session.id}/approve`, { username, password });
			setPassword('');
			await session.incrementalPatch({
				approved_by: response.data.approved_by,
				approval_required: false,
				sync_error: null,
			});
			onClosed(await actions.closeSession({ counted }));
			onOpenChange(false);
		} catch (e) {
			const refused =
				(e as { response?: { data?: { code?: string } } }).response?.data?.code ===
				'wcpos_override_refused';
			setError(t(refused ? 'register.cannot_approve' : 'register.approval_failed'));
		} finally {
			setBusy(false);
		}
	};
	return (
		<Dialog open onOpenChange={onOpenChange}>
			<DialogContent side={side} portalHost="pos" testID="approve-sheet">
				<DialogTitle>{t('register.manager_approval')}</DialogTitle>
				{!online && <Text testID="approve-offline">{t('register.approve_offline')}</Text>}
				<Text>{t('register.username')}</Text>
				<Input
					testID="approve-username"
					className="min-h-11"
					value={username}
					onChangeText={setUsername}
					autoCapitalize="none"
					autoCorrect={false}
				/>
				<Text>{t('register.password')}</Text>
				<Input
					testID="approve-password"
					className="min-h-11"
					value={password}
					onChangeText={setPassword}
					secureTextEntry
					autoCapitalize="none"
					autoCorrect={false}
				/>
				{!!error && <Text testID="approve-error">{error}</Text>}
				<Button
					testID="approve-confirm"
					className="min-h-14"
					loading={busy}
					disabled={!online || !username.trim() || !password}
					onPress={confirm}
				>
					{t('register.approve')}
				</Button>
			</DialogContent>
		</Dialog>
	);
}
