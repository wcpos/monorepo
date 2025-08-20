import { Subject, Subscription } from 'rxjs';

export class SubscribableBase {
	public isCanceled = false;
	private cancelSubject = new Subject<void>();
	public cancel$ = this.cancelSubject.asObservable();

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
	 * Cancel
	 *
	 * Make sure we clean up subscriptions:
	 * - things we subscribe to in this class, also
	 * - complete the subjects accessible from this class
	 */
	cancel() {
		Object.values(this.subs).forEach((sub) => sub.unsubscribe());
		Object.values(this.subjects).forEach((subject) => subject.complete());
		this.isCanceled = true;
		this.cancelSubject.next();
		this.cancelSubject.complete();
	}
}
