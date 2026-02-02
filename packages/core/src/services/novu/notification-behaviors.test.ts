import { getNotificationBehavior, isKnownWorkflow, WORKFLOW_IDS } from './notification-behaviors';

describe('notification-behaviors', () => {
	describe('WORKFLOW_IDS', () => {
		it('should have expected workflow IDs', () => {
			expect(WORKFLOW_IDS.WELCOME).toBe('welcome');
			expect(WORKFLOW_IDS.PLUGIN_UPDATE).toBe('plugin-update');
			expect(WORKFLOW_IDS.LICENSE_EXPIRING).toBe('license-expiring');
			expect(WORKFLOW_IDS.LICENSE_EXPIRED).toBe('license-expired');
			expect(WORKFLOW_IDS.ANNOUNCEMENT).toBe('announcement');
		});
	});

	describe('isKnownWorkflow', () => {
		it('should return true for known workflows', () => {
			expect(isKnownWorkflow('welcome')).toBe(true);
			expect(isKnownWorkflow('plugin-update')).toBe(true);
			expect(isKnownWorkflow('license-expiring')).toBe(true);
			expect(isKnownWorkflow('license-expired')).toBe(true);
			expect(isKnownWorkflow('announcement')).toBe(true);
		});

		it('should return false for unknown workflows', () => {
			expect(isKnownWorkflow('unknown')).toBe(false);
			expect(isKnownWorkflow('random')).toBe(false);
		});

		it('should return false for undefined', () => {
			expect(isKnownWorkflow(undefined)).toBe(false);
		});

		it('should return false for empty string', () => {
			expect(isKnownWorkflow('')).toBe(false);
		});
	});

	describe('getNotificationBehavior', () => {
		it('should return empty object for unknown workflow', () => {
			expect(getNotificationBehavior('nonexistent')).toEqual({});
		});

		it('should return empty object for undefined workflow', () => {
			expect(getNotificationBehavior(undefined)).toEqual({});
		});

		describe('welcome workflow', () => {
			it('should not show toast or save to db', () => {
				const behavior = getNotificationBehavior('welcome');
				expect(behavior.showToast).toBe(false);
				expect(behavior.saveToDb).toBe(false);
			});
		});

		describe('plugin-update workflow', () => {
			it('should show toast and save to db', () => {
				const behavior = getNotificationBehavior('plugin-update');
				expect(behavior.showToast).toBe(true);
				expect(behavior.saveToDb).toBe(true);
				expect(behavior.level).toBe('info');
			});
		});

		describe('license-expired workflow', () => {
			it('should show error toast that is not dismissable', () => {
				const behavior = getNotificationBehavior('license-expired');
				expect(behavior.level).toBe('error');
				expect(behavior.toast?.dismissable).toBe(false);
				expect(behavior.toast?.action?.label).toBe('Renew Now');
			});
		});

		describe('severity overrides', () => {
			it('should escalate to error for critical severity', () => {
				const behavior = getNotificationBehavior('welcome', 'critical');
				expect(behavior.showToast).toBe(true);
				expect(behavior.saveToDb).toBe(true);
				expect(behavior.level).toBe('error');
				expect(behavior.toast?.dismissable).toBe(false);
			});

			it('should escalate unknown workflow with critical severity', () => {
				const behavior = getNotificationBehavior('unknown', 'critical');
				expect(behavior.showToast).toBe(true);
				expect(behavior.level).toBe('error');
			});

			it('should set warning defaults for warning severity', () => {
				const behavior = getNotificationBehavior('welcome', 'warning');
				expect(behavior.showToast).toBe(true);
				expect(behavior.level).toBe('warn');
			});

			it('should not override existing level for warning severity', () => {
				const behavior = getNotificationBehavior('license-expired', 'warning');
				expect(behavior.level).toBe('error');
			});

			it('should not override existing showToast for warning severity', () => {
				const behavior = getNotificationBehavior('plugin-update', 'warning');
				expect(behavior.showToast).toBe(true);
			});
		});
	});
});
