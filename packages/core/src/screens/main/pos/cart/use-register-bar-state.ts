import { useDocField } from '@wcpos/query';

import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useRegisterBinding } from '../../../../services/register/use-register-binding';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { useOnlineBadge } from '../../components/bar-controls';
import { useAwaitingStoreCount } from '../checkout/use-awaiting-store';
import { describeRegisterBar } from './register-bar.helpers';

/**
 * What the till's bar says, read once: the place (`Store` or `Store · Register`) and the register
 * pill's words. The POS register bar and the desktop title bar both draw it (Paul, 2026-10-30);
 * every read is the store session's, so it works outside the till.
 */
export function useRegisterBarState(): { place: string; pillLabel: string | undefined } {
	const { session, sessionsOn, overdue } = useRegisterSession();
	const { store } = useStoreSession();
	const t = useT();
	const binding = useRegisterBinding();
	const storeName = useDocField(store, (value) => value.name) as string;
	// The store being unreachable reads as offline to a cashier: one pill, one place.
	const online = useOnlineBadge() === undefined;
	const awaitingStore = useAwaitingStoreCount();
	const { place, pill } = describeRegisterBar({
		registerName: binding.registerName,
		registerCount: binding.registers.length,
		storeName,
		// While Try again runs the directory reads `unknown`; the pill keeps the state being retried.
		bindingStatus: binding.retrying === 'none' ? 'none' : binding.status,
		// Only an unbound till reads Offline for a failed directory read (the gate's twin); a bound
		// till keeps its session pills, or one 5xx at boot would hide Overdue all day.
		directoryFailed:
			(binding.status === 'unknown' && binding.failed) || binding.retrying === 'failed',
		online,
		sessionsOn,
		sessionStatus: session?.status,
		approvalRequired: session?.approval_required,
		overdue,
		awaitingStore,
	});
	const pillLabels: Record<NonNullable<typeof pill>, string> = {
		'register.choose_register': t('register.choose_register', { count: awaitingStore }),
		'register.no_register': t('register.no_register', { count: awaitingStore }),
		'register.offline_to_send': t('register.offline_to_send', { count: awaitingStore }),
		'register.offline': t('register.offline', { count: awaitingStore }),
		'register.counting': t('register.counting', { count: awaitingStore }),
		'register.approval_needed': t('register.approval_needed', { count: awaitingStore }),
		'register.overdue': t('register.overdue', { count: awaitingStore }),
		'register.closed': t('register.closed', { count: awaitingStore }),
		'register.awaiting_store': t('register.awaiting_store', { count: awaitingStore }),
	};
	return { place, pillLabel: pill ? pillLabels[pill] : undefined };
}
