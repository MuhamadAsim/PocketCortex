import { NativeModules, Platform } from 'react-native';

export interface PdfExtractionResult {
  text: string;
  pageCount: number;
  isLikelyScanned: boolean;
}

export interface PdfTextExtractorNativeModule {
  extractText(filePath: string): Promise<PdfExtractionResult>;
}

const { PdfTextExtractor } = NativeModules;

// Throw a clear descriptive error at import time if NativeModules.PdfTextExtractor is undefined,
// reminding the developer to perform a native rebuild (npx react-native run-android) instead of just a JS reload.
// (Bypassed only during Jest test runs where native modules are mocked).
if (!PdfTextExtractor && (typeof jest === 'undefined') && Platform.OS === 'android') {
  throw new Error(
    'Native module "PdfTextExtractor" is undefined. ' +
    'PDF extraction requires native code (PDFBox-Android). ' +
    'Please perform a native rebuild (e.g. npx react-native run-android) rather than just a JavaScript reload.'
  );
}

export const NativePdfTextExtractor: PdfTextExtractorNativeModule | undefined =
  PdfTextExtractor as PdfTextExtractorNativeModule | undefined;

export async function extractPdfText(filePath: string): Promise<PdfExtractionResult> {
  if (!NativePdfTextExtractor || typeof NativePdfTextExtractor.extractText !== 'function') {
    throw new Error(
      'Native module "PdfTextExtractor" is unavailable. ' +
      'Please perform a native rebuild of the Android application to enable PDF parsing.'
    );
  }

  return await NativePdfTextExtractor.extractText(filePath);
}
