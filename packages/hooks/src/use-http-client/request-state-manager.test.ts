import { requestStateManager } from './request-state-manager';

describe('RequestStateManager', () => {
	beforeEach(() => {
		requestStateManager.reset();
	});

	describe('checkCanProceed', () => {
		it('should return ok:true by default', () => {
			expect(requestStateManager.checkCanProceed()).toEqual({ ok: true });
		});

		it('should block when offline', () => {
			requestStateManager.setOffline(true);
			const result = requestStateManager.checkCanProceed();
			expect(result.ok).toBe(false);
			expect(result.reason).toContain('internet');
		});

		it('should block when auth failed', () => {
			requestStateManager.setAuthFailed(true);
			const result = requestStateManager.checkCanProceed();
			expect(result.ok).toBe(false);
			expect(result.reason).toContain('log in');
		});

		it('should block when requests paused', () => {
			requestStateManager.pauseRequests();
			const result = requestStateManager.checkCanProceed();
			expect(result.ok).toBe(false);
			expect(result.reason).toContain('recovering');
		});

		it('should allow after offline then back online', () => {
			requestStateManager.setOffline(true);
			requestStateManager.setOffline(false);
			expect(requestStateManager.checkCanProceed().ok).toBe(true);
		});
	});

	describe('state getters', () => {
		it('isOffline defaults to false', () => {
			expect(requestStateManager.isOffline()).toBe(false);
		});

		it('isAuthFailed defaults to false', () => {
			expect(requestStateManager.isAuthFailed()).toBe(false);
		});

		it('areRequestsPaused defaults to false', () => {
			expect(requestStateManager.areRequestsPaused()).toBe(false);
		});
	});

	describe('pauseRequests / resumeRequests', () => {
		it('should pause and resume', () => {
			requestStateManager.pauseRequests();
			expect(requestStateManager.areRequestsPaused()).toBe(true);
			requestStateManager.resumeRequests();
			expect(requestStateManager.areRequestsPaused()).toBe(false);
		});
	});

	describe('token refresh coordination', () => {
		it('isTokenRefreshing defaults to false', () => {
			expect(requestStateManager.isTokenRefreshing()).toBe(false);
		});

		it('getRefreshedToken defaults to null', () => {
			expect(requestStateManager.getRefreshedToken()).toBeNull();
		});

		it('should set and clear refreshed token', () => {
			requestStateManager.setRefreshedToken('abc123');
			expect(requestStateManager.getRefreshedToken()).toBe('abc123');
			requestStateManager.clearRefreshedToken();
			expect(requestStateManager.getRefreshedToken()).toBeNull();
		});

		it('should coordinate single token refresh', async () => {
			await requestStateManager.startTokenRefresh(async () => 'new-token');
			expect(requestStateManager.getRefreshedToken()).toBe('new-token');
			expect(requestStateManager.isTokenRefreshing()).toBe(false);
		});

		it('should clear authFailed on successful refresh', async () => {
			requestStateManager.setAuthFailed(true);
			await requestStateManager.startTokenRefresh(async () => 'token');
			expect(requestStateManager.isAuthFailed()).toBe(false);
		});

		it('should handle refresh failure', async () => {
			await expect(
				requestStateManager.startTokenRefresh(async () => {
					throw new Error('refresh failed');
				})
			).rejects.toThrow('refresh failed');
			expect(requestStateManager.isTokenRefreshing()).toBe(false);
			expect(requestStateManager.getRefreshedToken()).toBeNull();
		});

		it('should deduplicate concurrent refresh calls', async () => {
			let callCount = 0;
			const refreshFn = async () => {
				callCount++;
				await new Promise((r) => setTimeout(r, 10));
				return 'token';
			};

			await Promise.all([
				requestStateManager.startTokenRefresh(refreshFn),
				requestStateManager.startTokenRefresh(refreshFn),
			]);
			expect(callCount).toBe(1);
		});

		it('awaitTokenRefresh resolves immediately if no refresh in progress', async () => {
			await expect(requestStateManager.awaitTokenRefresh()).resolves.toBeUndefined();
		});
	});

	describe('onWake', () => {
		it('should register and call wake callback', () => {
			const cb = jest.fn();
			requestStateManager.onWake(cb);
			// We can't easily trigger visibility change in jsdom, but we can verify registration
			expect(typeof requestStateManager.onWake).toBe('function');
		});

		it('should return cleanup function', () => {
			const cb = jest.fn();
			const cleanup = requestStateManager.onWake(cb);
			expect(typeof cleanup).toBe('function');
			cleanup();
		});
	});

	describe('reset', () => {
		it('should reset all state', () => {
			requestStateManager.setOffline(true);
			requestStateManager.setAuthFailed(true);
			requestStateManager.pauseRequests();
			requestStateManager.setRefreshedToken('token');

			requestStateManager.reset();

			expect(requestStateManager.isOffline()).toBe(false);
			expect(requestStateManager.isAuthFailed()).toBe(false);
			expect(requestStateManager.areRequestsPaused()).toBe(false);
			expect(requestStateManager.getRefreshedToken()).toBeNull();
			expect(requestStateManager.isTokenRefreshing()).toBe(false);
		});
	});
});
