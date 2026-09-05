const assert = require('node:assert/strict');
const test = require('node:test');

const {
	NETWORK_SECURITY_CONFIG_XML,
	setNetworkSecurityConfigAttribute,
} = require('./with-user-ca-trust');

const sampleManifest = () => ({
	manifest: {
		application: [{ $: { 'android:name': '.MainApplication' } }],
	},
});

test('sets the networkSecurityConfig attribute on the application element', () => {
	const result = setNetworkSecurityConfigAttribute(sampleManifest());
	assert.equal(
		result.manifest.application[0].$['android:networkSecurityConfig'],
		'@xml/network_security_config'
	);
	assert.equal(result.manifest.application[0].$['android:name'], '.MainApplication');
});

test('is idempotent', () => {
	const once = setNetworkSecurityConfigAttribute(sampleManifest());
	const twice = setNetworkSecurityConfigAttribute(once);
	assert.equal(
		twice.manifest.application[0].$['android:networkSecurityConfig'],
		'@xml/network_security_config'
	);
});

test('throws on a manifest without an application element', () => {
	assert.throws(
		() => setNetworkSecurityConfigAttribute({ manifest: {} }),
		/could not find <application>/
	);
});

test('the config trusts system AND user anchors, nothing else', () => {
	assert.ok(NETWORK_SECURITY_CONFIG_XML.includes('<certificates src="system" />'));
	assert.ok(NETWORK_SECURITY_CONFIG_XML.includes('<certificates src="user" />'));
	assert.ok(!NETWORK_SECURITY_CONFIG_XML.includes('debug-overrides'));
});

// A custom networkSecurityConfig replaces the dev client's stock config, and
// <base-config> without cleartextTrafficPermitted DENIES cleartext on API 28+.
// The loopback-only allow-list (#1634) still broke physical devices, which
// reach Metro over the LAN, and the app's own HTTP printer probes; there is no
// range syntax to allow-list a LAN, so dev/adhoc builds permit cleartext in
// base-config and nowhere else (no domain-config, no debug-overrides).
test('dev/adhoc builds permit cleartext in base-config and nowhere else', () => {
	const base = NETWORK_SECURITY_CONFIG_XML.match(/<base-config[^>]*>[\s\S]*?<\/base-config>/)[0];
	assert.ok(base.startsWith('<base-config cleartextTrafficPermitted="true">'));
	assert.ok(!NETWORK_SECURITY_CONFIG_XML.includes('<domain-config'));
	assert.equal(NETWORK_SECURITY_CONFIG_XML.match(/cleartextTrafficPermitted/g).length, 1);
});
