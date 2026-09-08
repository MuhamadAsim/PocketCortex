package com.pocketcortex.pdf

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import java.io.File

class PdfTextExtractorModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "PdfTextExtractor"

    @ReactMethod
    fun extractText(filePath: String, promise: Promise) {
        Thread {
            var document: PDDocument? = null
            try {
                // Normalize file path if URI scheme is present
                var cleanPath = filePath
                if (cleanPath.startsWith("file://")) {
                    cleanPath = cleanPath.substring(7)
                }

                val file = File(cleanPath)
                if (!file.exists()) {
                    promise.reject("FILE_NOT_FOUND", "PDF file not found at: $cleanPath")
                    return@Thread
                }

                document = PDDocument.load(file)
                val pageCount = document.numberOfPages
                val stripper = PDFTextStripper()
                val text = stripper.getText(document) ?: ""

                // Scanned PDF detection heuristic:
                // If average extracted characters per page is less than 20,
                // the PDF is likely scanned images with no embedded text layer.
                val trimmedLength = text.trim().length
                val isLikelyScanned = if (pageCount > 0) {
                    (trimmedLength / pageCount) < 20
                } else {
                    true
                }

                val resultMap = Arguments.createMap().apply {
                    putString("text", text)
                    putInt("pageCount", pageCount)
                    putBoolean("isLikelyScanned", isLikelyScanned)
                }

                promise.resolve(resultMap)
            } catch (e: Exception) {
                promise.reject(
                    "PDF_EXTRACTION_FAILED",
                    "Failed to extract text from PDF: ${e.message}",
                    e
                )
            } finally {
                try {
                    document?.close()
                } catch (_: Exception) {
                    // Ignore close exceptions
                }
            }
        }.start()
    }
}
