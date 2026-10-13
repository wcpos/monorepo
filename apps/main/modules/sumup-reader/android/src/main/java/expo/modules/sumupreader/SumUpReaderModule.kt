package expo.modules.sumupreader

import android.app.Activity
import android.content.Intent
import com.sumup.merchant.reader.api.SumUpAPI
import com.sumup.merchant.reader.api.SumUpLogin
import com.sumup.merchant.reader.api.SumUpPayment
import com.sumup.reader.sdk.api.SumUpState
import com.sumup.merchant.reader.models.SavedCardReaderDetailsResult
import com.sumup.checkout.core.models.TransactionInfo
import com.sumup.contract.offline.OfflineSessionState
import com.sumup.merchant.reader.offline.callbacks.OfflineSessionCallback
import com.sumup.merchant.reader.offline.callbacks.SecurityPatchUpdateCallback
import com.sumup.merchant.reader.offline.session.domain.contracts.StartOfflineSessionCallback
import com.sumup.merchant.reader.offline.session.domain.contracts.StopOfflineSessionCallback
import com.sumup.merchant.reader.offline.session.domain.model.OfflineOperationResult.StartOfflineSessionResult
import com.sumup.merchant.reader.offline.session.domain.model.OfflineOperationResult.StopOfflineSessionResult
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.math.BigDecimal

class SumUpReaderModule : Module() {
  companion object {
    private var initialized = false
    private var affiliateKey: String? = null
    // Process-wide screen ownership prevents another JS runtime from starting a charge; the
    // pending promise lives here too, so a module instance recreated while a SumUp activity is
    // open (JS reload) can still settle the result that comes back to onActivityResult.
    private var busy = false
    private var pending: Promise? = null
    private var pendingCode: Int? = null
    private const val LOGIN = 48201
    private const val SETTINGS = 48202
    private const val CHECKOUT = 48203
  }
  private fun requireSetup() {
    if (!initialized || affiliateKey == null) throw CodedException("ERR_SUMUP_SETUP", "Set up SumUp first", null)
  }
  private fun status(): Map<String, Any?>? {
    if (!initialized || !SumUpAPI.isLoggedIn()) return null
    val reader = SumUpAPI.getSavedCardReaderDetails() as? SavedCardReaderDetailsResult.SavedCardReaderDetails ?: return null
    return mapOf("connected" to SumUpAPI.isCardReaderConnected(), "serial" to reader.serialNumber,
      "model" to reader.readerType?.toString(), "battery" to reader.lastKnownBatteryPercentage)
  }
  // SumUp's offline calls must be serial and never run under one of its screens.
  private fun requireIdle() {
    requireSetup()
    if (busy) throw CodedException("ERR_SUMUP_BUSY", "A SumUp operation is already in progress", null)
  }
  private fun startFailure(result: StartOfflineSessionResult): String = when (result) {
    is StartOfflineSessionResult.NotEligible -> "This SumUp reader cannot take offline payments"
    is StartOfflineSessionResult.FeatureNotEnabled -> "SumUp has not enabled offline payments on this account"
    is StartOfflineSessionResult.OfflineLimitsAbsent -> "Go online once so SumUp can download its offline limits"
    is StartOfflineSessionResult.TransactionsPresent -> "Go online to upload the stored SumUp offline payments first"
    is StartOfflineSessionResult.UserLoggedOut -> "Log in to SumUp first"
    else -> "SumUp could not start an offline session"
  }
  private fun emitStatus() { sendEvent("onReaderStatus", mapOf("reader" to status())) }
  private fun launch(code: Int, promise: Promise, action: (Activity) -> Unit) {
    requireSetup()
    if (busy) throw CodedException("ERR_SUMUP_BUSY", "A SumUp operation is already in progress", null)
    val activity = appContext.currentActivity ?: throw CodedException("ERR_SUMUP_ACTIVITY", "No active screen to present SumUp", null)
    busy = true
    pending = promise
    pendingCode = code
    try { action(activity) } catch (error: Exception) {
      pending = null; pendingCode = null; busy = false
      throw error
    }
  }
  @Suppress("DEPRECATION")
  private fun checkoutResult(resultCode: Int, data: Intent?): Map<String, Any?> {
    val code = if (data?.hasExtra(SumUpAPI.Response.RESULT_CODE) == true) data.getIntExtra(SumUpAPI.Response.RESULT_CODE, 0) else null
    val info = data?.getParcelableExtra<TransactionInfo>(SumUpAPI.Response.TX_INFO)
    val outcome = when {
      code == 15 -> "unknown"
      code == 1 -> "success"
      code == 2 -> "failed"
      info?.status == "CANCELLED" -> "cancelled"
      code != null -> "failed"
      resultCode == Activity.RESULT_CANCELED -> "cancelled"
      else -> "unknown"
    }
    return mapOf("outcome" to outcome, "resultCode" to code,
      "transactionCode" to data?.getStringExtra(SumUpAPI.Response.TX_CODE),
      "amount" to info?.amount?.toString(), "tipAmount" to info?.tipAmount?.toString(),
      "currency" to info?.currency, "cardType" to info?.card?.type,
      "last4" to info?.card?.last4Digits, "message" to data?.getStringExtra(SumUpAPI.Response.MESSAGE),
      "offline" to data?.getStringExtra(SumUpAPI.Response.TX_TYPE)?.let { it == "OFFLINE" })
  }
  override fun definition() = ModuleDefinition {
    Name("SumUpReader")
    Events("onReaderStatus")
    AsyncFunction("setup") { key: String ->
      if (key.isBlank()) throw CodedException("ERR_SUMUP_KEY", "Missing SumUp affiliate key", null)
      if (affiliateKey != null && affiliateKey != key) throw CodedException("ERR_SUMUP_KEY", "Restart WCPOS to change the SumUp affiliate key", null)
      if (!initialized) {
        val context = appContext.reactContext?.applicationContext ?: throw CodedException("ERR_SUMUP_CONTEXT", "No application context", null)
        SumUpState.init(context)
        initialized = true
      }
      affiliateKey = key
      emitStatus()
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("isLoggedIn") { initialized && SumUpAPI.isLoggedIn() }.runOnQueue(Queues.MAIN)
    AsyncFunction("login") { options: Map<String, String>, promise: Promise ->
      launch(LOGIN, promise) { activity ->
        val builder = SumUpLogin.builder(affiliateKey!!)
        options["accessToken"]?.let { builder.accessToken(it) }
        SumUpAPI.openLoginActivity(activity, builder.build(), LOGIN)
      }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("logout") {
      requireSetup()
      if (busy) throw CodedException("ERR_SUMUP_BUSY", "A SumUp operation is already in progress", null)
      SumUpAPI.logout()
      emitStatus()
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("merchant") {
      requireSetup()
      val merchant = SumUpAPI.getCurrentMerchant()
      merchant?.let { mapOf("merchantCode" to it.merchantCode, "currencyCode" to it.currency?.name) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("openReaderSettings") { promise: Promise ->
      launch(SETTINGS, promise) { SumUpAPI.openCardReaderPage(it, SETTINGS) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("readerStatus") { status() }.runOnQueue(Queues.MAIN)
    AsyncFunction("isTipOnReaderAvailable") {
      requireSetup()
      SumUpAPI.isTipOnCardReaderAvailable()
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("prepareForCheckout") {
      requireSetup()
      SumUpAPI.prepareForCheckout()
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("offlineSessionActive") { promise: Promise ->
      requireSetup()
      SumUpAPI.fetchCurrentOfflineSession(object : OfflineSessionCallback {
        override fun onSessionInfoReceived(state: OfflineSessionState) { promise.resolve(state is OfflineSessionState.ActiveSession) }
      })
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("startOfflineSession") { promise: Promise ->
      requireIdle()
      SumUpAPI.startOfflineSession(object : StartOfflineSessionCallback {
        override fun onResult(result: StartOfflineSessionResult) {
          if (result is StartOfflineSessionResult.Success || result is StartOfflineSessionResult.SessionInProgress) promise.resolve(null)
          else promise.reject("ERR_SUMUP_OFFLINE", startFailure(result), null)
        }
      })
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("stopOfflineSession") { promise: Promise ->
      requireIdle()
      SumUpAPI.stopOfflineSession(object : StopOfflineSessionCallback {
        override fun onResult(result: StopOfflineSessionResult) {
          if (result is StopOfflineSessionResult.Success || result is StopOfflineSessionResult.NoActiveSession) promise.resolve(null)
          else promise.reject("ERR_SUMUP_OFFLINE", "SumUp could not end its offline session", null)
        }
      })
    }.runOnQueue(Queues.MAIN)
    // Only the public API refreshes the offline limits in 7.1.0; without them start refuses.
    AsyncFunction("prepareOffline") { promise: Promise ->
      requireIdle()
      SumUpAPI.updateOfflineSecurityPatch(object : SecurityPatchUpdateCallback {
        override fun onSuccess() { promise.resolve(null) }
        override fun onFailure() { promise.reject("ERR_SUMUP_OFFLINE", "SumUp could not download its offline limits", null) }
      })
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("checkout") { options: Map<String, Any>, promise: Promise ->
      val builder = SumUpPayment.builder()
        .total(BigDecimal(options["amount"] as String))
        .currency(SumUpPayment.Currency.valueOf(options["currency"] as String))
        .title(options["title"] as String)
        .foreignTransactionId(options["foreignTransactionId"] as String)
      if (options["tipOnReader"] == true) builder.tipOnCardReader()
      if (options["skipSuccessScreen"] == true) builder.skipSuccessScreen()
      val payment = builder.build()
      launch(CHECKOUT, promise) { SumUpAPI.checkout(it, payment, CHECKOUT) }
    }.runOnQueue(Queues.MAIN)
    OnActivityResult { _, (requestCode, resultCode, data) ->
      if (requestCode == pendingCode) {
        val promise = pending
        pending = null; pendingCode = null; busy = false
        if (requestCode == CHECKOUT) promise?.resolve(checkoutResult(resultCode, data))
        else if (requestCode == LOGIN && !SumUpAPI.isLoggedIn()) {
          promise?.reject("ERR_SUMUP_LOGIN", data?.getStringExtra(SumUpAPI.Response.MESSAGE) ?: "SumUp login was cancelled", null)
        } else {
          val code = data?.getIntExtra(SumUpAPI.Response.RESULT_CODE, 1) ?: 1
          if (code == 1 || (requestCode == LOGIN && SumUpAPI.isLoggedIn())) promise?.resolve(null)
          else promise?.reject("ERR_SUMUP_$code", data?.getStringExtra(SumUpAPI.Response.MESSAGE) ?: "SumUp result $code", null)
        }
        emitStatus()
      }
    }
  }
}
