package expo.modules.wedgekeyevents

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class WedgeKeyEventsModule : Module() {
	override fun definition() = ModuleDefinition {
		Name("WedgeKeyEvents")

		Events("onWedgeKey")

		Function("setCapturedDevices") { identities: List<Map<String, Any?>> ->
			WedgeKeyDispatcher.setCapturedDevices(identities)
		}

		Function("setCaptureAll") { enabled: Boolean ->
			WedgeKeyDispatcher.captureAll = enabled
		}

		OnStartObserving {
			WedgeKeyDispatcher.emitter = { payload -> sendEvent("onWedgeKey", payload) }
		}

		OnStopObserving {
			WedgeKeyDispatcher.emitter = null
		}
	}
}
