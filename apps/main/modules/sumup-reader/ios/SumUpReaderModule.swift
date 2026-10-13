import ExpoModulesCore
import SumUpSDK
import UIKit

struct SumUpLoginOptions: Record {
  @Field var accessToken: String?
}
struct SumUpCheckoutOptions: Record {
  @Field(.required) var amount: String = ""
  @Field(.required) var currency: String = ""
  @Field(.required) var title: String = ""
  @Field(.required) var foreignTransactionId: String = ""
  @Field var tipOnReader: Bool = false
  @Field var skipSuccessScreen: Bool = true
}

public class SumUpReaderModule: Module {
  // SDK setup and screen ownership survive JS reloads. Every access is on the main queue.
  private static var affiliateKey: String?
  private static var busy = false

  private func requireSetup() throws {
    guard Self.affiliateKey != nil else { throw Exception(name: "SumUpSetup", description: "Set up SumUp first") }
  }
  private func controller() throws -> UIViewController {
    guard let controller = appContext?.utilities?.currentViewController() else {
      throw Exception(name: "SumUpActivity", description: "No active screen to present SumUp")
    }
    return controller
  }
  private func begin() throws {
    try requireSetup()
    guard !Self.busy else { throw Exception(name: "SumUpBusy", description: "A SumUp operation is already in progress") }
    Self.busy = true
  }
  // Android's ReaderType names, so the driver reads one model vocabulary on both platforms
  // (String(describing:) on an imported C enum gives no case name).
  private func model(_ type: ReaderType) -> String {
    switch type {
    case .solo: return "SOLO"
    case .soloLite: return "SOLO_LITE"
    case .air: return "AIR"
    case .threeG: return "THREE_G"
    case .pinPlus: return "PIN_PLUS"
    default: return "UNKNOWN"
    }
  }
  private func status() -> [String: Any]? {
    guard Self.affiliateKey != nil, let reader = SumUpSDK.lastReaderStatus else { return nil }
    return ["connected": reader.isActive, "serial": reader.serialNumber,
            "model": model(reader.readerType), "battery": reader.batteryLevel]
  }
  // Set when this app starts an offline session, cleared once SumUp has its payments. iOS
  // answers "no session" and "unreadable" with the same undocumented error, so this tells them
  // apart: an error with no session of ours is none; with one, it is treated as live.
  private static let sessionKey = "wcpos.sumup.offlineSessionStarted"
  private static var sessionStarted: Bool {
    get { UserDefaults.standard.bool(forKey: sessionKey) }
    set { UserDefaults.standard.set(newValue, forKey: sessionKey) }
  }
  // SumUp's offline calls must be serial and never overlap one of its screens: each holds
  // `busy` (begin) until its completion settles back on the main queue.
  private func finish(_ promise: Promise, _ success: Bool, _ error: Error?, _ failure: String) {
    DispatchQueue.main.async {
      Self.busy = false
      if success { promise.resolve(nil) }
      else { promise.reject("SumUpOffline", error?.localizedDescription ?? failure) }
    }
  }
  private func emitStatus() {
    sendEvent("onReaderStatus", ["reader": status() as Any? ?? NSNull()])
  }
  private func complete(_ promise: Promise, _ success: Bool, _ error: Error?) {
    Self.busy = false
    emitStatus()
    if let error { promise.reject(error) }
    else if !success { promise.reject("SumUpCancelled", "SumUp login was cancelled") }
    else { promise.resolve(nil) }
  }

  public func definition() -> ModuleDefinition {
    Name("SumUpReader")
    Events("onReaderStatus")
    AsyncFunction("setup") { (key: String) in
      guard !key.isEmpty else { throw Exception(name: "SumUpKey", description: "Missing SumUp affiliate key") }
      if let current = Self.affiliateKey {
        guard current == key else { throw Exception(name: "SumUpKey", description: "Restart WCPOS to change the SumUp affiliate key") }
        return
      }
      // SMPSumUpSDK is imported into Swift as SumUpSDK in the 7.1 SDK.
      SumUpSDK.setup(affiliateKey: key)
      Self.affiliateKey = key
      self.emitStatus()
    }.runOnQueue(.main)
    AsyncFunction("isLoggedIn") { Self.affiliateKey != nil && SumUpSDK.isLoggedIn }.runOnQueue(.main)
    AsyncFunction("login") { (options: SumUpLoginOptions, promise: Promise) in
      let controller = try self.controller()
      try self.begin()
      if SumUpSDK.isLoggedIn { self.complete(promise, true, nil); return }
      let completion: (Bool, Error?) -> Void = { success, error in
        self.complete(promise, success, error)
      }
      if let token = options.accessToken {
        SumUpSDK.login(withToken: token, completion: completion)
      } else {
        SumUpSDK.presentLogin(from: controller, animated: true, completionBlock: completion)
      }
    }.runOnQueue(.main)
    AsyncFunction("logout") { (promise: Promise) in
      try self.begin()
      SumUpSDK.logout { success, error in self.complete(promise, success, error) }
    }.runOnQueue(.main)
    AsyncFunction("merchant") { () -> [String: Any]? in
      try self.requireSetup()
      guard let merchant = SumUpSDK.currentMerchant else { return nil }
      // Both fields are optional on the SDK's merchant object; the driver treats a missing
      // code as "not logged in" rather than a crash.
      return [
        "merchantCode": merchant.merchantCode ?? NSNull(),
        "currencyCode": merchant.currencyCode ?? NSNull(),
      ]
    }.runOnQueue(.main)
    AsyncFunction("openReaderSettings") { (promise: Promise) in
      let controller = try self.controller()
      try self.begin()
      SumUpSDK.presentCardReaderSettings(from: controller, animated: true) { _, error in
        self.complete(promise, true, error)
      }
    }.runOnQueue(.main)
    AsyncFunction("readerStatus") { self.status() }.runOnQueue(.main)
    AsyncFunction("isTipOnReaderAvailable") { () -> Bool in
      try self.requireSetup()
      return SumUpSDK.isTipOnCardReaderAvailable
    }.runOnQueue(.main)
    AsyncFunction("prepareForCheckout") {
      try self.requireSetup()
      SumUpSDK.prepareForCheckout()
    }.runOnQueue(.main)
    AsyncFunction("offlineSessionActive") { (promise: Promise) in
      try self.begin()
      SumUpSDK.getOfflineSessionDetails { details, _ in
        DispatchQueue.main.async {
          Self.busy = false
          promise.resolve(details != nil || Self.sessionStarted)
        }
      }
    }.runOnQueue(.main)
    AsyncFunction("startOfflineSession") { (promise: Promise) in
      try self.begin()
      SumUpSDK.startOfflineSession { success, error in
        if success { DispatchQueue.main.async { Self.sessionStarted = true } }
        self.finish(promise, success, error, "SumUp could not start an offline session")
      }
    }.runOnQueue(.main)
    // Upload what the device holds and end the session. endOfflineSession does not report a
    // failed upload, so it only ends a session with nothing approved in it, or one SumUp can no
    // longer read after a failed upload (ending is always permitted and keeps stored payments).
    AsyncFunction("uploadOffline") { (promise: Promise) in
      try self.begin()
      SumUpSDK.getOfflineSessionDetails { details, _ in
        DispatchQueue.main.async {
          let failure = "SumUp could not upload the offline payments; it will try again when online"
          // After a failed upload the marker stays, so the next sync or online payment retries it.
          let end = { (clear: Bool, error: Error?) in
            SumUpSDK.endOfflineSession { ended, endError in
              if ended && clear { DispatchQueue.main.async { Self.sessionStarted = false } }
              self.finish(promise, ended, error ?? endError, failure)
            }
          }
          if details == nil && !Self.sessionStarted { self.finish(promise, true, nil, failure); return }
          if let details, details.approvedTransactionsCount == 0 { end(true, nil); return }
          SumUpSDK.uploadOfflineSession { success, error in
            DispatchQueue.main.async {
              if success { Self.sessionStarted = false; self.finish(promise, true, nil, failure) }
              else if details == nil { end(false, error) }
              else { self.finish(promise, false, error, failure) }
            }
          }
        }
      }
    }.runOnQueue(.main)
    // The SDK downloads its offline limits itself after login; SumUp discourages calling
    // setupOfflineSession by hand, so there is nothing to prepare on iOS.
    AsyncFunction("prepareOffline") { try self.requireSetup() }.runOnQueue(.main)
    AsyncFunction("checkout") { (options: SumUpCheckoutOptions, promise: Promise) in
      let controller = try self.controller()
      let total = NSDecimalNumber(string: options.amount, locale: Locale(identifier: "en_US_POSIX"))
      guard total != .notANumber else { throw Exception(name: "SumUpAmount", description: "Invalid SumUp amount") }
      let request = CheckoutRequest(total: total, title: options.title, currencyCode: options.currency)
      request.foreignTransactionID = options.foreignTransactionId
      request.tipOnCardReaderIfAvailable = options.tipOnReader
      if options.skipSuccessScreen { request.skipScreenOptions = .success }
      try self.begin()
      SumUpSDK.checkout(with: request, from: controller) { result, error in
        Self.busy = false
        let info = result?.additionalInfo ?? [:]
        let card = info["card"] as? [String: Any] ?? [:]
        let failure = error as NSError?
        // A missing result is not a merchant cancellation or a successful charge.
        let outcome = error != nil ? "failed" : result == nil ? "unknown" : result!.success ? "success" : "cancelled"
        var response: [String: Any] = ["outcome": outcome]
        response["transactionCode"] = result?.transactionCode
        response["amount"] = info["amount"].map { String(describing: $0) }
        response["tipAmount"] = info["tip_amount"].map { String(describing: $0) }
        response["currency"] = info["currency"]
        response["cardType"] = card["card_type"]
        response["last4"] = card["last_4_digits"]
        response["message"] = failure?.localizedDescription
        response["resultCode"] = failure?.code
        promise.resolve(response)
        self.emitStatus()
      }
    }.runOnQueue(.main)
  }
}
