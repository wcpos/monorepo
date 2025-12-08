/**
 * Electron implementation of useOnlineStatus
 *
 * Electron runs in Chromium, so we can use the same approach as web.
 * Re-exports from the web implementation.
 */
export {
	OnlineStatusContext,
	OnlineStatusProvider,
	useOnlineStatus,
	type OnlineStatus,
} from './use-online-status.web';

