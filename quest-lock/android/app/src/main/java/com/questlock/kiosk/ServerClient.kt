package com.questlock.kiosk

import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/** Talks to server/server.py. All calls block; run them off the main thread. */
class ServerClient(private val baseUrl: String, private val deviceKey: String) {

    data class Status(
        val name: String,
        val locked: Boolean,
        val remainingSeconds: Long,
        val allowedPackages: List<String>,
    )

    class ServerException(message: String) : IOException(message)

    fun status(deviceId: String): Status =
        parse(request("GET", "/api/device/status?id=" + URLEncoder.encode(deviceId, "UTF-8"), null))

    fun redeem(deviceId: String, code: String): Status =
        parse(request("POST", "/api/device/redeem", JSONObject().put("id", deviceId).put("code", code)))

    private fun request(method: String, path: String, body: JSONObject?): JSONObject {
        val conn = URL(baseUrl + path).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = method
            conn.connectTimeout = 4000
            conn.readTimeout = 4000
            conn.setRequestProperty("X-Device-Key", deviceKey)
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write(body.toString().toByteArray()) }
            }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            val json = if (text.isNotEmpty()) JSONObject(text) else JSONObject()
            if (code !in 200..299) throw ServerException(json.optString("error", "HTTP $code"))
            return json
        } finally {
            conn.disconnect()
        }
    }

    private fun parse(json: JSONObject): Status {
        val pkgs = json.optJSONArray("allowed_packages")
        return Status(
            name = json.optString("name"),
            locked = json.getBoolean("locked"),
            remainingSeconds = json.getLong("remaining_seconds"),
            allowedPackages = List(pkgs?.length() ?: 0) { pkgs!!.getString(it) },
        )
    }
}
