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

	public readonly subs: Record<string, Subscription> = {};
	protected subjects: Record<string, Subject<any>> = {};

	/**
	 * Add subscription
	 *
	 * Adds a subscription to the subs map with a unique key
	 * If a subscription already exists for the key, it unsubscribes first.
	 */
	addSub(key: string, subscription: Subscription) {
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
	 */
	cancel() {
		// Abort any pending async operations first
		this.abortController.abort();

		Object.values(this.subs).forEach((sub) => sub.unsubscribe());
		Object.values(this.subjects).forEach((subject) => subject.complete());
		this.isCanceled = true;
		this.cancelSubject.next();
		this.cancelSubject.complete();
	}
}
