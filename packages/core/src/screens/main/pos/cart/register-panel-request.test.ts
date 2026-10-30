import { consumeRegisterPanelRequest, requestRegisterPanel } from './register-panel-request';

it('carries the requested pane and consumes it once, defaulting to register', () => {
	try {
		requestRegisterPanel('count');
		expect(consumeRegisterPanelRequest()).toBe('count');
		expect(consumeRegisterPanelRequest()).toBeNull();
		requestRegisterPanel();
		expect(consumeRegisterPanelRequest()).toBe('register');
		expect(consumeRegisterPanelRequest()).toBeNull();
	} finally {
		consumeRegisterPanelRequest();
	}
});
