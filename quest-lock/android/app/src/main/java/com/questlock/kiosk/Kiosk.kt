package com.questlock.kiosk

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.util.Log

/**
 * Device-owner powers. When the app is device owner (set by your MDM, or by
 * `adb shell dpm set-device-owner com.questlock.kiosk/.AdminReceiver`) it can:
 *  - pin itself with lock task mode so the menu button can't escape,
 *  - allow only the paid-for games to run inside that lock task,
 *  - suspend those games when time runs out, which closes them.
 * Without device owner everything here is a no-op and the app runs in "soft" mode.
 */
object Kiosk {
    private const val TAG = "QuestLock"

    fun admin(context: Context) = ComponentName(context, AdminReceiver::class.java)

    private fun dpm(context: Context) =
        context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

    fun isDeviceOwner(context: Context) = dpm(context).isDeviceOwnerApp(context.packageName)

    /** Lock task allowlist = this app + the allowed games. Also claims the home screen. */
    fun configure(context: Context, allowedPackages: Collection<String>) {
        if (!isDeviceOwner(context)) return
        val dpm = dpm(context)
        val admin = admin(context)
        dpm.setLockTaskPackages(admin, (listOf(context.packageName) + allowedPackages).toTypedArray())
        dpm.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_NONE)
        val home = IntentFilter(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            addCategory(Intent.CATEGORY_DEFAULT)
        }
        dpm.addPersistentPreferredActivity(admin, home, ComponentName(context, LockActivity::class.java))
    }

    fun setSuspended(context: Context, packages: Collection<String>, suspended: Boolean) {
        if (packages.isEmpty() || !isDeviceOwner(context)) return
        val failed = dpm(context).setPackagesSuspended(admin(context), packages.toTypedArray(), suspended)
        if (failed.isNotEmpty()) Log.w(TAG, "Could not change suspension for: ${failed.joinToString()}")
    }

    /** Leave kiosk mode for maintenance (staff only). */
    fun release(context: Context) {
        if (!isDeviceOwner(context)) return
        val dpm = dpm(context)
        dpm.clearPackagePersistentPreferredActivities(admin(context), context.packageName)
        setSuspended(context, Config(context).managedPackages, false)
    }
}
