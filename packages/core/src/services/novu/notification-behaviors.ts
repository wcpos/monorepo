/**
 * Client-side notification behavior configuration.
 *
 * Instead of passing behavior flags through Novu's data field (which has limitations),
 * we define behavior per workflow ID on the client. This gives us:
 * - Full TypeScript type safety
 * - Complex nested configs (Novu limits to 10 scalar fields)
 * - Centralized, easy-to-extend configuration
 * - No Novu UI configuration needed beyond basic workflow setup
 */

/**
 * Behavior configuration for a notification type
 */
export interface NotificationBehavior {
	/** Show a toast notification when received (default: false) */
	showToast?: boolean;
	/** Save to the logs database for troubleshooting (default: false) */
	saveToDb?: boolean;
	/** Toast level/color: info (blue), success (green), warn (yellow), error (red) */
	level?: 'info' | 'success' | 'warn' | 'error';
	/** Toast customization */
	toast?: {
		/** Use notification body as toast secondary text (default: true when showToast) */
		useBodyAsText2?: boolean;
		/** Custom text2 override (takes precedence over useBodyAsText2) */
		text2?: string;
		/** Show close button on toast (default: true) */
		dismissable?: boolean;
		/** Action button configuration */
		action?: {
			/** Button label */
			label: string;
			/** URL to open - external (https://...) or internal route (/settings) */
			url?: string;
		};
	};
}

/**
 * Workflow IDs - must match workflows created in Novu Dashboard
 */
export const WORKFLOW_IDS = {
	WELCOME: 'welcome',
	PLUGIN_UPDATE: 'plugin-update',
	// Future workflows
	LICENSE_EXPIRING: 'license-expiring',
	LICENSE_EXPIRED: 'license-expired',
	ANNOUNCEMENT: 'announcement',
} as const;

/**
 * Default behaviors keyed by workflow ID.
 *
 * To add a new notification type:
 * 1. Create the workflow in Novu Dashboard
 * 2. Add the workflow ID to WORKFLOW_IDS
 * 3. Add behavior config here
 */
const WORKFLOW_BEHAVIORS: Record<string, NotificationBehavior> = {
	// Welcome notification - appears in bell, no toast
	[WORKFLOW_IDS.WELCOME]: {
		showToast: false,
		saveToDb: false,
	},

	// Plugin update available - show toast and save to logs
	[WORKFLOW_IDS.PLUGIN_UPDATE]: {
		showToast: true,
		saveToDb: true,
		level: 'info',
		toast: {
			useBodyAsText2: true,
			dismissable: true,
		},
	},

	// License expiring soon - warn user with action
	[WORKFLOW_IDS.LICENSE_EXPIRING]: {
		showToast: true,
		saveToDb: true,
		level: 'warn',
		toast: {
			useBodyAsText2: true,
			dismissable: true,
			action: {
				label: 'Renew',
				url: 'https://wcpos.com/pro',
			},
		},
	},

	// License expired - persistent error
	[WORKFLOW_IDS.LICENSE_EXPIRED]: {
		showToast: true,
		saveToDb: true,
		level: 'error',
		toast: {
			useBodyAsText2: true,
			dismissable: false,
			action: {
				label: 'Renew Now',
				url: 'https://wcpos.com/pro',
			},
		},
	},

	// General announcement - info toast
	[WORKFLOW_IDS.ANNOUNCEMENT]: {
		showToast: true,
		saveToDb: false,
		level: 'info',
		toast: {
			useBodyAsText2: true,
			dismissable: true,
		},
	},
};

/**
 * Get behavior configuration for a notification.
 *
 * @param workflowId - The workflow identifier from notification.data.workflowId
 * @param severity - Optional Novu severity field for overrides
 * @returns Behavior configuration for the notification
 */
export function getNotificationBehavior(
	workflowId: string | undefined,
	severity?: string
): NotificationBehavior {
	// Get base behavior for workflow, or empty object for unknown workflows
	const base = (workflowId && WORKFLOW_BEHAVIORS[workflowId]) || {};

	// Severity overrides - Novu's built-in field can escalate importance
	if (severity === 'critical') {
		return {
			...base,
			showToast: true,
			saveToDb: true,
			level: 'error',
			toast: {
				...base.toast,
				dismissable: false,
			},
		};
	}

	if (severity === 'warning') {
		return {
			...base,
			showToast: base.showToast ?? true,
			level: base.level ?? 'warn',
		};
	}

	return base;
}

/**
 * Check if a workflow ID is known/configured
 */
export function isKnownWorkflow(workflowId: string | undefined): boolean {
	return !!workflowId && workflowId in WORKFLOW_BEHAVIORS;
}
