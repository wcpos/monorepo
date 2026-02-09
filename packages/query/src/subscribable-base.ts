import { Subject, Subscription } from 'rxjs';

export class SubscribableBase {
	public isCanceled = false;
	private cancelSubject = new Subject<void>();
	public cancel$ = this.cancelSubject.asObservable();

	/**
	 * AbortController for canceling async operations (HTTP requests, etc.)
	 * Check abortController.signal.aborted before starting new operations
	 */
	protected abortController = new AbortController();

	public readonly subs: Record<string, Subscription | { unsubscribe(): void }> = {};
	protected subjects: Record<string, Subject<any>> = {};

	/**
	 * Add subscription
	 *
	 * Adds a subscription to the subs map with a unique key
	 * If a subscription already exists for the key, it unsubscribes first.
	 */
	addSub(key: string, subscription: Subscription | { unsubscribe(): void }) {
		if (this.subs[key]) {
			this.subs[key].unsubscribe();
		}
		this.subs[key] = subscription;
	}

	/**
	 * Cancel a subscription by key
	 */
	public cancelSub(key: string) {
		if (this.subs[key]) {
			this.subs[key].unsubscribe();
			delete this.subs[key];
		}
	}

	/**
	 * Get the abort signal to pass to async operations
	 */
	get signal(): AbortSignal {
		return this.abortController.signal;
	}

	/**
	 * Check if this instance has been canceled
	 */
	get isAborted(): boolean {
		return this.abortController.signal.aborted;
	}

	/**
	 * Cancel
	 *
	 * Make sure we clean up subscriptions:
	 * - things we subscribe to in this class, also
	 * - complete the subjects accessible from this class
	 * - abort any pending async operations
	 *
	 * @returns Promise that resolves when cleanup is complete
	 */
	async cancel(): Promise<void> {
		if (this.isCanceled) {
			return; // Already canceled, avoid double cleanup
		}

		// Mark as canceled first to prevent new operations
		this.isCanceled = true;

		// Abort any pending async operations
		this.abortController.abort();

		// Unsubscribe all subscriptions
		Object.values(this.subs).forEach((sub) => sub.unsubscribe());

		// Complete all subjects
		Object.values(this.subjects).forEach((subject) => subject.complete());

		// Signal cancellation to observers
		this.cancelSubject.next();
		this.cancelSubject.complete();
	}
}
