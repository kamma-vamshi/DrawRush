# DrawRush ProGuard rules

# Keep all Kotlin metadata
-keepattributes *Annotation*
-keepattributes RuntimeVisibleAnnotations
-keepattributes Signature
-keepattributes InnerClasses
-keepattributes EnclosingMethod

# Kotlin serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class com.drawrush.app.**$$serializer { *; }
-keepclassmembers class com.drawrush.app.** {
    *** Companion;
}
-keepclasseswithmembers class com.drawrush.app.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Socket.IO (Netty transitive)
-keep class io.socket.** { *; }
-keep class io.netty.** { *; }
-dontwarn io.netty.**
-keep class com.google.gson.** { *; }

# Firebase
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }

# OkHttp (transitive)
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**

# Hilt
-keep class dagger.hilt.** { *; }
-keep class javax.inject.** { *; }
-keep @dagger.hilt.android.AndroidEntryPoint class * { *; }

# DataStore
-keep class androidx.datastore.** { *; }

# DrawRush data models
-keep class com.drawrush.app.data.model.** { *; }
