package com.questlock.kiosk

import android.annotation.SuppressLint
import android.content.Context
import android.provider.Settings

/** Server address and keys. Defaults come from the build; staff can override them on the headset. */
class Config(context: Context) {
    private val prefs = context.getSharedPreferences("config", Context.MODE_PRIVATE)
    private val appContext = context.applicationContext

    var serverUrl: String
        get() = prefs.getString("server_url", null) ?: BuildConfig.SERVER_URL
        set(value) = prefs.edit().putString("server_url", value.trim().trimEnd('/')).apply()

    var deviceKey: String
        get() = prefs.getString("device_key", null) ?: BuildConfig.DEVICE_KEY
        set(value) = prefs.edit().putString("device_key", value.trim()).apply()

    /** Stable per-headset id, e.g. "quest-3f9a12bc". Shown on the dashboard until staff rename it. */
    val deviceId: String
        @SuppressLint("HardwareIds")
        get() {
            val androidId = Settings.Secure.getString(appContext.contentResolver, Settings.Secure.ANDROID_ID)
            return "quest-" + (androidId ?: "unknown").take(8)
        }

    /** Every package this app has ever been told to allow, so removed games get suspended too. */
    var managedPackages: Set<String>
        get() = prefs.getStringSet("managed_packages", emptySet()) ?: emptySet()
        set(value) = prefs.edit().putStringSet("managed_packages", value).apply()
}
