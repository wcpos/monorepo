export class LiveTabNotOwnedError extends Error {
	constructor() {
		super('This tab no longer runs the register');
		this.name = 'LiveTabNotOwnedError';
	}
}
