package com.questlock.kiosk

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.util.Log
import android.widget.Toast
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/** Keeps running while games are in front: polls the server and enforces the timer. */
class LockService : Service() {

    private lateinit var executor: ScheduledExecutorService

    override fun onCreate() {
        super.onCreate()
        LockController.init(this)
        startForeground(NOTIFICATION_ID, notification())
        LockController.enforceNow()

        executor = Executors.newSingleThreadScheduledExecutor()
        executor.scheduleWithFixedDelay(::poll, 0, POLL_SECONDS, TimeUnit.SECONDS)
        executor.scheduleWithFixedDelay({ LockController.tick() }, 1, 1, TimeUnit.SECONDS)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int) = START_STICKY

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun poll() {
        val config = Config(this)
        try {
            val status = ServerClient(config.serverUrl, config.deviceKey).status(config.deviceId)
            LockController.onServerStatus(status)
        } catch (e: Exception) {
            Log.w(TAG, "Status poll failed: ${e.message}")
            LockController.onServerUnreachable()
        }
    }

    private fun notification(): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, getString(R.string.app_name), NotificationManager.IMPORTANCE_LOW)
        )
        return Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(getString(R.string.notification))
            .setOngoing(true)
            .build()
    }

    companion object {
        private const val TAG = "QuestLock"
        private const val CHANNEL = "session"
        private const val NOTIFICATION_ID = 1
        private const val POLL_SECONDS = 5L

        fun start(context: Context) {
            context.startForegroundService(Intent(context, LockService::class.java))
        }

        /**
         * Pull the user back to the lock screen. Background activity starts are allowed
         * for device owners and for apps granted SYSTEM_ALERT_WINDOW.
         */
        fun showLockScreen(context: Context) {
            context.startActivity(
                Intent(context, LockActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            )
        }

        fun warn(context: Context) {
            Toast.makeText(context, R.string.time_warning, Toast.LENGTH_LONG).show()
        }
    }
}
