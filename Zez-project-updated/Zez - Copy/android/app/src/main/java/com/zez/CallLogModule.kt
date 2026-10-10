
package com.zez

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class CallLogModule(
    private val context: ReactApplicationContext
) : ReactContextBaseJavaModule(context) {

    private val callLogObserver = CallLogObserver(context)

    override fun getName(): String = "ZezCallLog"

    @ReactMethod
    fun startObserving() {
        callLogObserver.start()
    }

    @ReactMethod
    fun stopObserving() {
        callLogObserver.stop()
    }

    override fun invalidate() {
        callLogObserver.stop()
        super.invalidate()
    }
}
