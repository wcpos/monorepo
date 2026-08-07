/**
 * Electron implementation of useOnlineStatus
 *
 * Re-exports the web implementation, whose reachability import resolves to
 * check-website-reachability.electron.ts and rides the main-process axios bridge.
 */
export {
	OnlineStatusContext,
	OnlineStatusProvider,
	useOnlineStatus,
	type OnlineStatus,
} from './use-online-status.web';
