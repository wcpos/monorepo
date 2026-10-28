import * as React from 'react';

import { Button } from '@wcpos/components/button';
import { Dialog, DialogContent, DialogTitle } from '@wcpos/components/dialog';
import { Input } from '@wcpos/components/input';
import { Toast } from '@wcpos/components/toast';
import { Text } from '@wcpos/components/text';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { recordApproval } from '@wcpos/query/register-session';

import { recordRegisterFact, useRegisterActor } from '../../../../services/register-session/audit';
import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';
import { usePanelSide } from '../contexts/overlay-side';
import { isSameCount } from '../../../../services/register-session/same-count';

export function ApproveSheet({
	counted,
	onClosed,
	onOpenChange,
}: {
	counted: Record<string, string>;
	onClosed: (
		closure: Awaited<ReturnType<ReturnType<typeof useRegisterSession>['actions']['closeSession']>>
	) => void;
	onOpenChange: (open: boolean) => void;
}) {
	const actor = useRegisterActor();
	const { storeDB } = useStoreSession();
	const { session, actions } = useRegisterSession();
	const http = useRestHttpClient();
	const online = useOnlineStatus().status === 'online-website-available';
	const [username, setUsername] = React.useState('');
	const [password, setPassword] = React.useState('');
	const [busy, setBusy] = React.useState(false);
	const [error, setError] = React.useState('');
	const t = useT();
	const side = usePanelSide('cart');
	const confirm = async () => {
		if (!online || busy || !session) return;
		setBusy(true);
		setError('');
		try {
			const response = await http.post(`sessions/${session.id}/approve`, {
				username,
				password,
				counted,
			});
			if (
				typeof response.data?.approved_by !== 'number' ||
				!isSameCount(response.data.approved_counted, counted)
			)
				throw new Error('invalid_approval_response');
			recordRegisterFact({
				kind: 'approval-granted',
				actor,
				sessionId: session.id,
				registerId: session.register_id,
				approvedBy: response.data.approved_by,
			});
			setPassword('');
			await recordApproval(storeDB, session.id, {
				approvedBy: response.data.approved_by,
				approvedCounted: response.data.approved_counted,
			});
			onClosed(await actions.closeSession({ counted }));
			onOpenChange(false);
		} catch (e) {
			const refused =
				(e as { response?: { data?: { code?: string } } }).response?.data?.code ===
				'wcpos_override_refused';
			if (refused)
				recordRegisterFact({
					kind: 'approval-refused',
					actor,
					sessionId: session.id,
					registerId: session.register_id,
				});
			const message = refused ? t('register.cannot_approve') : t('register.approval_failed');
			setError(message);
			Toast.show({ type: 'error', title: message });
		} finally {
			setBusy(false);
		}
	};
	return (
		<Dialog open onOpenChange={onOpenChange}>
			<DialogContent side={side} size="lg" portalHost="pos" testID="approve-sheet">
				<DialogTitle>{t('register.manager_approval')}</DialogTitle>
				{!online && <Text testID="approve-offline">{t('register.approve_offline')}</Text>}
				<ApprovalFields {...{ username, password, setUsername, setPassword }} />
				{!!error && <Text testID="approve-error">{error}</Text>}
				<Button
					testID="approve-confirm"
					size="lg"
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

export function ApprovalFields({
	username,
	password,
	setUsername,
	setPassword,
}: {
	username: string;
	password: string;
	setUsername: (value: string) => void;
	setPassword: (value: string) => void;
}) {
	const t = useT();
	return (
		<>
			<Text>{t('register.username')}</Text>
			<Input
				testID="approve-username"
				className="min-h-row border-border"
				value={username}
				onChangeText={setUsername}
				autoCapitalize="none"
				autoCorrect={false}
			/>
			<Text>{t('register.password')}</Text>
			<Input
				testID="approve-password"
				className="min-h-row border-border"
				value={password}
				onChangeText={setPassword}
				secureTextEntry
				autoCapitalize="none"
				autoCorrect={false}
			/>
		</>
	);
}
