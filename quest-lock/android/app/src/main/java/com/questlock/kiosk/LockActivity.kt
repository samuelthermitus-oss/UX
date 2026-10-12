package com.questlock.kiosk

import android.app.Activity
import android.app.ActivityManager
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.GridLayout
import android.widget.LinearLayout
import android.widget.TextView
import java.util.concurrent.Executors

/** The screen a customer sees: code entry while locked, game picker + timer while unlocked. */
class LockActivity : Activity() {

    private val io = Executors.newSingleThreadExecutor()
    private lateinit var title: TextView
    private lateinit var deviceName: TextView
    private lateinit var lockedGroup: View
    private lateinit var unlockedGroup: View
    private lateinit var timeLeft: TextView
    private lateinit var games: GridLayout
    private lateinit var message: TextView
    private lateinit var codeInput: EditText
    private lateinit var unlockButton: Button

    private var shownPackages: List<String>? = null
    private val listener: (LockController.State) -> Unit = { render(it) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_lock)
        title = findViewById(R.id.title)
        deviceName = findViewById(R.id.device_name)
        lockedGroup = findViewById(R.id.locked_group)
        unlockedGroup = findViewById(R.id.unlocked_group)
        timeLeft = findViewById(R.id.time_left)
        games = findViewById(R.id.games)
        message = findViewById(R.id.message)
        codeInput = findViewById(R.id.code)
        unlockButton = findViewById(R.id.unlock)

        unlockButton.setOnClickListener { redeem() }
        codeInput.setOnEditorActionListener { _, action, _ ->
            (action == EditorInfo.IME_ACTION_GO).also { if (it) redeem() }
        }
        title.setOnLongClickListener { askStaffPin(); true }

        LockController.init(this)
        LockService.start(this)
    }

    override fun onResume() {
        super.onResume()
        visible = true
        LockController.addListener(listener)
        enterLockTask()
    }

    override fun onPause() {
        visible = false
        LockController.removeListener(listener)
        super.onPause()
    }

    override fun onDestroy() {
        io.shutdownNow()
        super.onDestroy()
    }

    @Deprecated("Back does nothing on the lock screen")
    override fun onBackPressed() = Unit

    private fun enterLockTask() {
        val am = getSystemService(ActivityManager::class.java)
        if (Kiosk.isDeviceOwner(this) && am.lockTaskModeState == ActivityManager.LOCK_TASK_MODE_NONE) {
            startLockTask()
        }
    }

    private fun render(s: LockController.State) {
        deviceName.text = s.deviceName
        message.text = if (s.online) "" else getString(R.string.offline)
        if (s.locked) {
            title.setText(R.string.locked_title)
            lockedGroup.visibility = View.VISIBLE
            unlockedGroup.visibility = View.GONE
        } else {
            title.setText(R.string.unlocked_title)
            lockedGroup.visibility = View.GONE
            unlockedGroup.visibility = View.VISIBLE
            timeLeft.text = formatTime(s.remainingMs())
            if (shownPackages != s.allowedPackages) showGames(s.allowedPackages)
        }
    }

    private fun showGames(packages: List<String>) {
        shownPackages = packages
        games.removeAllViews()
        val launchable = packages.mapNotNull { pkg -> launchIntent(pkg)?.let { pkg to it } }
        if (launchable.isEmpty()) {
            games.addView(TextView(this).apply {
                setText(R.string.no_games)
                setTextColor(getColor(R.color.muted))
                textSize = 18f
            })
            return
        }
        for ((pkg, launch) in launchable) {
            val label = try {
                packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0))
            } catch (e: PackageManager.NameNotFoundException) {
                pkg
            }
            val icon = try { packageManager.getApplicationIcon(pkg) } catch (e: Exception) { null }
            games.addView(Button(this).apply {
                text = label
                isAllCaps = false
                textSize = 18f
                gravity = Gravity.CENTER
                minWidth = dp(200)
                minHeight = dp(160)
                icon?.setBounds(0, 0, dp(72), dp(72))
                setCompoundDrawables(null, icon, null, null)
                compoundDrawablePadding = dp(8)
                setOnClickListener { startActivity(launch) }
                layoutParams = GridLayout.LayoutParams().apply { setMargins(dp(8), dp(8), dp(8), dp(8)) }
            })
        }
    }

    /** Normal launcher intent, or the Quest VR category that immersive apps use. */
    private fun launchIntent(pkg: String): Intent? {
        packageManager.getLaunchIntentForPackage(pkg)?.let { return it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
        val vr = Intent(Intent.ACTION_MAIN).addCategory("com.oculus.intent.category.VR").setPackage(pkg)
        val match = packageManager.queryIntentActivities(vr, 0).firstOrNull() ?: return null
        return vr.setClassName(pkg, match.activityInfo.name).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    private fun redeem() {
        val code = codeInput.text.toString().trim().uppercase()
        if (code.isEmpty()) return
        unlockButton.isEnabled = false
        val config = Config(this)
        io.execute {
            val error = try {
                LockController.onServerStatus(
                    ServerClient(config.serverUrl, config.deviceKey).redeem(config.deviceId, code)
                )
                null
            } catch (e: ServerClient.ServerException) {
                e.message
            } catch (e: Exception) {
                getString(R.string.offline)
            }
            runOnUiThread {
                unlockButton.isEnabled = true
                if (error == null) codeInput.text.clear() else message.text = error
            }
        }
    }

    // ---- staff settings ----------------------------------------------------

    private fun askStaffPin() {
        val pin = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
        }
        AlertDialog.Builder(this)
            .setTitle("Staff PIN")
            .setView(pin)
            .setPositiveButton("OK") { _, _ ->
                if (pin.text.toString() == BuildConfig.STAFF_PIN) showStaffSettings()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showStaffSettings() {
        val config = Config(this)
        val url = EditText(this).apply { setText(config.serverUrl); hint = "Server URL" }
        val key = EditText(this).apply { setText(config.deviceKey); hint = "Device key" }
        val info = TextView(this).apply {
            text = "Device id: ${config.deviceId}\nDevice owner: ${Kiosk.isDeviceOwner(this@LockActivity)}"
        }
        val form = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(8), dp(24), 0)
            addView(info); addView(url); addView(key)
        }
        AlertDialog.Builder(this)
            .setTitle("Staff settings")
            .setView(form)
            .setPositiveButton("Save") { _, _ ->
                config.serverUrl = url.text.toString()
                config.deviceKey = key.text.toString()
            }
            .setNeutralButton("Exit kiosk") { _, _ ->
                Kiosk.release(this)
                if (getSystemService(ActivityManager::class.java).lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE) {
                    stopLockTask()
                }
                stopService(Intent(this, LockService::class.java))
                finishAndRemoveTask()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    companion object {
        /** True while the lock screen is in front; read by LockController. */
        @Volatile
        var visible = false
            private set
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun formatTime(ms: Long): String {
        val total = (ms + 999) / 1000
        val h = total / 3600
        val m = (total / 60) % 60
        val s = total % 60
        return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
    }
}
