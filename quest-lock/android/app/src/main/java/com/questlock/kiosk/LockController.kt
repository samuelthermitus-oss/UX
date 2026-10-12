package com.questlock.kiosk

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import java.util.concurrent.CopyOnWriteArraySet

/**
 * Single source of truth for "is this headset locked?".
 *
 * The server says how many seconds are left; we turn that into a deadline on the
 * monotonic clock so wall-clock changes don't matter, and keep counting down even
 * if the network drops. When the deadline passes we lock, server or no server.
 * After a reboot the headset starts locked until the server says otherwise.
 */
object LockController {

    data class State(
        val locked: Boolean = true,
        /** SystemClock.elapsedRealtime() at which the session ends. */
        val unlockEndsAt: Long = 0,
        val allowedPackages: List<String> = emptyList(),
        val deviceName: String = "",
        val online: Boolean = false,
    ) {
        fun remainingMs() = (unlockEndsAt - SystemClock.elapsedRealtime()).coerceAtLeast(0)
    }

    private val main = Handler(Looper.getMainLooper())
    private val listeners = CopyOnWriteArraySet<(State) -> Unit>()
    private lateinit var appContext: Context
    private var warned = false
    private var lastPullBack = 0L

    @Volatile
    var state = State()
        private set

    fun init(context: Context) {
        if (!::appContext.isInitialized) appContext = context.applicationContext
    }

    fun addListener(listener: (State) -> Unit) {
        listeners += listener
        listener(state)
    }

    fun removeListener(listener: (State) -> Unit) {
        listeners -= listener
    }

    /** Apply a status from the server. Safe to call from any thread. */
    fun onServerStatus(status: ServerClient.Status) = main.post {
        val remainingMs = status.remainingSeconds * 1000
        update(
            state.copy(
                // Ignore sub-3s sessions so a slightly late server clock cannot flip us back open.
                locked = status.locked || remainingMs < 3000,
                unlockEndsAt = SystemClock.elapsedRealtime() + remainingMs,
                allowedPackages = status.allowedPackages,
                deviceName = status.name,
                online = true,
            )
        )
    }

    fun onServerUnreachable() = main.post { update(state.copy(online = false)) }

    /** Called every second by the service; enforces the deadline locally. */
    fun tick() = main.post {
        val s = state
        if (s.locked) {
            // Something (Quest menu, a game) got in front of the lock screen: pull it back.
            // With device-owner kiosk mode this rarely triggers; without it, it's the main guard.
            val now = SystemClock.elapsedRealtime()
            if (!LockActivity.visible && now - lastPullBack > 3_000) {
                lastPullBack = now
                LockService.showLockScreen(appContext)
            }
            return@post
        }
        val remaining = s.remainingMs()
        if (remaining == 0L) {
            update(s.copy(locked = true))
        } else {
            if (remaining <= 60_000 && !warned) {
                warned = true
                LockService.warn(appContext)
            }
            listeners.forEach { it(s) } // refresh countdowns
        }
    }

    private fun update(next: State) {
        val prev = state
        state = next
        if (!next.locked) {
            if (next.remainingMs() > 60_000) warned = false
        }

        if (prev.allowedPackages != next.allowedPackages || prev.locked != next.locked) {
            enforce(next)
        }
        if (next.locked && !prev.locked) {
            LockService.showLockScreen(appContext)
        }
        listeners.forEach { it(next) }
    }

    /** Make the OS match the state: allowed games runnable only while unlocked. */
    private fun enforce(s: State) {
        val config = Config(appContext)
        val managed = config.managedPackages + s.allowedPackages
        config.managedPackages = managed
        Kiosk.configure(appContext, if (s.locked) emptyList() else s.allowedPackages)
        if (s.locked) {
            Kiosk.setSuspended(appContext, managed, true)
        } else {
            Kiosk.setSuspended(appContext, managed - s.allowedPackages.toSet(), true)
            Kiosk.setSuspended(appContext, s.allowedPackages, false)
        }
    }

    /** Re-apply suspensions on startup, in case the app died mid-session. */
    fun enforceNow() = main.post { enforce(state) }
}
