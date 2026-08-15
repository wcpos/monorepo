package expo.modules.wedgekeyevents

import android.view.KeyEvent

/**
 * Activity-level key interceptor for attributed barcode scanners.
 *
 * MainActivity forwards every dispatchKeyEvent here (injected by the
 * with-wedge-key-events config plugin). Keys from a registered device are
 * emitted to JS and swallowed so scanner input never reaches focused fields;
 * in capture-all mode (scanner registration) every external device's keys are
 * emitted WITHOUT being swallowed so the app can identify the scanner.
 */
object WedgeKeyDispatcher {
	data class DeviceIdentity(val vendorId: Int, val productId: Int, val deviceName: String)

	@Volatile
	var captureAll: Boolean = false

	@Volatile
	private var captured: List<DeviceIdentity> = emptyList()

	@Volatile
	var emitter: ((Map<String, Any?>) -> Unit)? = null

	fun setCapturedDevices(identities: List<Map<String, Any?>>) {
		captured = identities.mapNotNull { identity ->
			val vendorId = (identity["vendorId"] as? Number)?.toInt() ?: return@mapNotNull null
			val productId = (identity["productId"] as? Number)?.toInt() ?: return@mapNotNull null
			val deviceName = identity["deviceName"] as? String ?: ""
			DeviceIdentity(vendorId, productId, deviceName)
		}
	}

	/**
	 * Returns true when the event belongs to a registered scanner and must be
	 * swallowed by the Activity (both ACTION_DOWN and ACTION_UP, so no
	 * half-pressed keys leak into focused inputs).
	 */
	fun handleKeyEvent(event: KeyEvent): Boolean {
		val device = event.device ?: return false
		val isMatch = captured.any { identity ->
			identity.vendorId == device.vendorId &&
				identity.productId == device.productId &&
				(identity.deviceName.isEmpty() || identity.deviceName == device.name)
		}
		if (!isMatch && !captureAll) {
			return false
		}

		if (event.action == KeyEvent.ACTION_DOWN) {
			val key = when (event.keyCode) {
				KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> "Enter"
				KeyEvent.KEYCODE_TAB -> "Tab"
				else -> {
					val unicode = event.unicodeChar
					if (unicode > 0) String(Character.toChars(unicode)) else ""
				}
			}
			if (key.isNotEmpty()) {
				emitter?.invoke(
					mapOf(
						"key" to key,
						"deviceId" to event.deviceId,
						"deviceName" to (device.name ?: ""),
						"vendorId" to device.vendorId,
						"productId" to device.productId,
						"timeMs" to event.eventTime,
						"captured" to isMatch
					)
				)
			}
		}

		return isMatch
	}
}
