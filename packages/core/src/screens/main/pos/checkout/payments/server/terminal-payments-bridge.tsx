import { useRegisterBindingSession } from '../../../../../../services/register/use-register-binding';
import { useTerminalPaymentsService } from './use-terminal-payments-service';

/**
 * Keeps terminal legs polling from above the screens, so a tab chip can report
 * "Waiting for terminal" and a non-current order can reach its receipt while the
 * cashier serves someone else. Lives under the query runtime and the store
 * session — the hook needs both — and above the POS screens, which come and go.
 */
export function TerminalPaymentsBridge(): null {
	useTerminalPaymentsService();
	useRegisterBindingSession();
	return null;
}
