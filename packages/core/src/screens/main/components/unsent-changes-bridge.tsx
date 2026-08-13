import { useUnsentChangesRecorder } from '../hooks/use-unsent-changes';

/**
 * Mirrors the durable mutation queue's depth into the process-wide reading that
 * the root error boundary can still read after the React tree has crashed
 * (#1098). Mounted beside the other engine bridges, inside the QueryProvider,
 * for the lifetime of the app session.
 */
export function UnsentChangesBridge() {
	useUnsentChangesRecorder();
	return null;
}
