import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.hilt)
    alias(libs.plugins.ksp)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.google.services)
}

// Load signing properties
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) load(keystorePropsFile.inputStream())
}

android {
    namespace = "com.drawrush.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.drawrush.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField("String", "PROTOCOL_VERSION", "\"1.0.0\"")
        buildConfigField("String", "APP_NAME", "\"DrawRush\"")

        manifestPlaceholders["deepLinkHost"] = "drawrush.app"
    }

    signingConfigs {
        create("release") {
            val ksFile = (keystoreProps["KEYSTORE_FILE"] as? String)
                ?: System.getenv("RELEASE_KEYSTORE_FILE")
            val ksPass = (keystoreProps["KEYSTORE_PASSWORD"] as? String)
                ?: System.getenv("RELEASE_KEYSTORE_PASSWORD")
            val kAlias = (keystoreProps["KEY_ALIAS"] as? String)
                ?: System.getenv("RELEASE_KEY_ALIAS")
            val kPass = (keystoreProps["KEY_PASSWORD"] as? String)
                ?: System.getenv("RELEASE_KEY_PASSWORD")

            if (!ksFile.isNullOrBlank() && !ksPass.isNullOrBlank() && !kAlias.isNullOrBlank() && !kPass.isNullOrBlank()) {
                storeFile = file(ksFile)
                storePassword = ksPass
                keyAlias = kAlias
                keyPassword = kPass
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            isDebuggable = true
            buildConfigField("Boolean", "DEV_AUTH", "true")
            val debugBackendUrl = project.findProperty("DEBUG_BACKEND_URL")?.toString()
                ?: project.findProperty("BACKEND_URL")?.toString()
                ?: System.getenv("DEBUG_BACKEND_URL")
                ?: System.getenv("BACKEND_URL")
                ?: "http://10.0.2.2:3001"
            buildConfigField("String", "BACKEND_URL", "\"$debugBackendUrl\"")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            buildConfigField("Boolean", "DEV_AUTH", "false")
            val releaseBackendUrl = project.findProperty("RELEASE_BACKEND_URL")?.toString()
                ?: System.getenv("RELEASE_BACKEND_URL")
                ?: "https://api.drawrush.app"
            buildConfigField("String", "BACKEND_URL", "\"$releaseBackendUrl\"")
            val releaseSigning = signingConfigs.getByName("release")
            if (releaseSigning.storeFile != null && releaseSigning.storeFile!!.exists()) {
                signingConfig = releaseSigning
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
            excludes += "META-INF/INDEX.LIST"
            excludes += "META-INF/io.netty.versions.properties"
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.splashscreen)

    // Compose
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons.extended)
    implementation(libs.androidx.navigation.compose)

    // Hilt DI
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.hilt.navigation.compose)

    // DataStore
    implementation(libs.androidx.datastore.preferences)

    // Kotlin Serialization
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)

    // Firebase
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.auth)

    // Google Sign-In (Credential Manager)
    implementation("androidx.credentials:credentials:1.3.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.3.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")

    // Socket.IO
    implementation(libs.socketio.client)

    // Tests
    testImplementation(libs.junit)
    testImplementation(libs.mockk)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.turbine)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.ui.test.junit4)
    debugImplementation(libs.androidx.ui.tooling)
    debugImplementation(libs.androidx.ui.test.manifest)
}
