plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

fun prop(name: String) = (project.findProperty(name) as String?).orEmpty()

android {
    namespace = "com.questlock.kiosk"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.questlock.kiosk"
        minSdk = 29          // Quest 2 shipped on Android 10
        targetSdk = 32
        versionCode = 1
        versionName = "1.0"

        buildConfigField("String", "SERVER_URL", "\"${prop("questLockServerUrl")}\"")
        buildConfigField("String", "DEVICE_KEY", "\"${prop("questLockDeviceKey")}\"")
        buildConfigField("String", "STAFF_PIN", "\"${prop("questLockStaffPin")}\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Sideloaded kiosk app: sign with the debug key unless you configure your own.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}
