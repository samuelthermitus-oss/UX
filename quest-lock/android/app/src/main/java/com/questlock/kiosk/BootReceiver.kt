package com.questlock.kiosk

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Boot straight into the lock screen. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        LockService.start(context)
        LockService.showLockScreen(context)
    }
}
