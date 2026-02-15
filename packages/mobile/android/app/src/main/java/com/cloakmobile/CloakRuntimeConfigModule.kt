package com.cloakmobile

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

class CloakRuntimeConfigModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "CloakRuntimeConfig"

  override fun getConstants(): MutableMap<String, Any> {
    return mutableMapOf(
      "applicationId" to BuildConfig.APPLICATION_ID,
      "buildType" to BuildConfig.BUILD_TYPE,
      "runtimeMode" to BuildConfig.CLOAK_RUNTIME_MODE,
      "networkMode" to BuildConfig.CLOAK_NETWORK_MODE,
    )
  }
}
