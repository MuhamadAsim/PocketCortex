package com.app

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.pocketcortex.pdf.PdfTextExtractorPackage
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(PdfTextExtractorPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    PDFBoxResourceLoader.init(applicationContext)
    loadReactNative(this)
  }
}
