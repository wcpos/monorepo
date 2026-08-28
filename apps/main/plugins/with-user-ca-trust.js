const { promises: fs } = require('fs');
const path = require('path');

const {
	createRunOncePlugin,
	withAndroidManifest,
	withDangerousMod,
} = require('@expo/config-plugins');

const pkg = 'with-wcpos-user-ca-trust';

// Since Android 7, user-installed CA certificates are NOT trusted by apps unless
// they opt in. Dev and adhoc builds opt in (ruling 2026-08-21, monorepo#1415) so
// self-signed/enterprise dev stores are testable on-device; production keeps the
// platform default (system CAs only). The plugin is only included for dev/adhoc
// profiles in app.config.ts — it applies unconditionally when present.
//
// The loopback <domain-config> exists because a custom networkSecurityConfig
// REPLACES the dev client's stock config wholesale, and <base-config> without
// cleartextTrafficPermitted denies cleartext on API 28+. That silently broke
// the dev client's ability to load JS from Metro: the launcher died with
// "CLEARTEXT communication to localhost not permitted" (native E2E run
// 33160623858, 2026-08-28 — the error screen named it outright). The set is
// React Native's own debug-config set: device loopback plus the two
// emulator→host aliases. Cleartext stays denied everywhere else, and the
// domain-config inherits the base trust-anchors.
const NETWORK_SECURITY_CONFIG_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config>
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </base-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">localhost</domain>
        <domain includeSubdomains="false">127.0.0.1</domain>
        <domain includeSubdomains="false">10.0.2.2</domain>
        <domain includeSubdomains="false">10.0.3.2</domain>
    </domain-config>
</network-security-config>
`;

function setNetworkSecurityConfigAttribute(manifest) {
	const application = manifest?.manifest?.application?.[0];
	if (!application) {
		throw new Error('with-wcpos-user-ca-trust: could not find <application> in AndroidManifest');
	}
	application.$ = application.$ ?? {};
	application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
	return manifest;
}

const withUserCaTrust = (config) => {
	config = withAndroidManifest(config, (config) => {
		config.modResults = setNetworkSecurityConfigAttribute(config.modResults);
		return config;
	});
	return withDangerousMod(config, [
		'android',
		async (config) => {
			const xmlDir = path.join(
				config.modRequest.platformProjectRoot,
				'app',
				'src',
				'main',
				'res',
				'xml'
			);
			await fs.mkdir(xmlDir, { recursive: true });
			await fs.writeFile(
				path.join(xmlDir, 'network_security_config.xml'),
				NETWORK_SECURITY_CONFIG_XML
			);
			return config;
		},
	]);
};

module.exports = createRunOncePlugin(withUserCaTrust, pkg, '0.1.0');
module.exports.setNetworkSecurityConfigAttribute = setNetworkSecurityConfigAttribute;
module.exports.NETWORK_SECURITY_CONFIG_XML = NETWORK_SECURITY_CONFIG_XML;
