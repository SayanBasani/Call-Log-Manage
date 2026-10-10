
package com.zez

import android.database.ContentObserver
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.CallLog
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule

class CallLogObserver(
    private val reactContext: ReactApplicationContext
) {
    private var observer: ContentObserver? = null

    fun start() {
        if (observer != null) return

        observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean, uri: Uri?) {
                super.onChange(selfChange, uri)

                if (!reactContext.hasActiveReactInstance()) return

                val params = Arguments.createMap()
                params.putString("uri", uri?.toString() ?: "")

                reactContext
                    .getJSModule(
                        DeviceEventManagerModule.RCTDeviceEventEmitter::class.java
                    )
                    .emit("ZezCallLogChanged", params)
            }
        }

        reactContext.contentResolver.registerContentObserver(
            CallLog.Calls.CONTENT_URI,
            true,
            observer!!
        )
    }

    fun stop() {
        observer?.let {
            reactContext.contentResolver.unregisterContentObserver(it)
        }
        observer = null
    }
}
