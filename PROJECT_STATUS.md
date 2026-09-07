# LocalMind RN — Project Status & Agent Guide

> **Project Goal:** On-device offline LLM chat application for Android using React Native (TypeScript), New Architecture (Fabric + TurboModules), `llama.rn` for local GGUF inference, `@dr.pogodin/react-native-fs` for resumable downloads, and `react-native-mmkv` for storage.

---

## Technical Constraints & Configuration

- **React Native Version:** 0.87.1
- **New Architecture:** Enabled (`newArchEnabled=true` in `android/gradle.properties`).
- **Target Architecture:** `arm64-v8a` (`reactNativeArchitectures=arm64-v8a` in `android/gradle.properties`).
- **TypeScript:** Strict configuration extending `@react-native/typescript-config`.
- **Inference Engine:** `llama.rn` (Pre-built `arm64-v8a` and `x86_64` jniLibs confirmed).
- **Filesystem / Downloads:** `@dr.pogodin/react-native-fs` (Maintained TurboModule fork of `react-native-fs`).
- **Storage:** `react-native-mmkv` (v4 with `react-native-nitro-modules`).
- **Navigation:** `@react-navigation/native` + `@react-navigation/native-stack` with `react-native-screens` and `react-native-safe-area-context`.
- **ProGuard Rules:** `-keep class com.rnllama.** { *; }` added to `android/app/proguard-rules.pro`.
- **Permissions:** `android.permission.INTERNET` and `<uses-native-library android:name="libOpenCL.so" android:required="false" />` added to `android/app/src/main/AndroidManifest.xml`.

---

## Verified Model Catalog Endpoints

| Model | Hugging Face Repo | Verified Filename | Direct URL |
|---|---|---|---|
| **Qwen 2.5 1.5B Instruct** | `Qwen/Qwen2.5-1.5B-Instruct-GGUF` | `qwen2.5-1.5b-instruct-q5_k_m.gguf` | `https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q5_k_m.gguf` |
| **Llama 3.2 1B Instruct** | `bartowski/Llama-3.2-1B-Instruct-GGUF` | `Llama-3.2-1B-Instruct-Q4_K_M.gguf` | `https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf` |
| **Gemma 3 1B Instruct** | `lm-kit/gemma-3-1b-instruct-gguf` | `gemma-3-it-1B-Q4_K_M.gguf` | `https://huggingface.co/lm-kit/gemma-3-1b-instruct-gguf/resolve/main/gemma-3-it-1B-Q4_K_M.gguf` |

---

## Build Progress Tracker

- [x] **Step 1 — Project Scaffold**
  - [x] Initialized React Native project with TypeScript template.
  - [x] Confirmed New Architecture is active (`newArchEnabled=true`).
  - [x] Configured `reactNativeArchitectures=arm64-v8a` in `android/gradle.properties`.
  - [x] Installed core dependencies (`llama.rn`, `@dr.pogodin/react-native-fs`, `react-native-mmkv`, `react-native-nitro-modules`, `@react-navigation/native`, `@react-navigation/native-stack`, `react-native-screens`, `react-native-safe-area-context`).
  - [x] Added `llama.rn` proguard rule to `android/app/proguard-rules.pro`.
  - [x] Configured `INTERNET` and OpenCL in `AndroidManifest.xml`.
  - [x] Verified zero TypeScript compilation errors (`npx tsc --noEmit`).
  - [x] Verified Android Metro JavaScript bundling.
- [x] **Step 2 — Types & Model Catalog**
  - [x] Created `src/types/models.ts` (`ModelDefinition`, `DownloadStatus`, `ModelDownloadState`, `ChatMessage`, `ConversationHistory`).
  - [x] Created `src/constants/modelCatalog.ts` with verified Hugging Face direct endpoints, exact file byte sizes, and helper functions (`getModelById`, `formatBytes`).
- [x] **Step 3 — MMKV Storage Layer**
  - [x] Created `src/storage/mmkv.ts` (single MMKV instance `localmind-rn-storage` and theme preference helpers).
  - [x] Created `src/storage/modelStorage.ts` (persisting download state, local file paths, active model selection).
  - [x] Created `src/storage/chatStorage.ts` (saving, loading, appending, and updating streamed chat messages per model).
- [x] **Step 4 — Download Manager**
  - [x] Created `src/services/downloadManager.ts` (start, progress, pause, resume with HTTP Range header, delete, disk sync, and event subscriptions).
  - [x] Created `patches/@dr.pogodin+react-native-fs+2.40.2.patch` via `patch-package` to enable file appending in `Downloader.kt` on HTTP 206 / Range requests.
  - [x] Persisted throttled progress in MMKV storage to preserve device flash lifetime and survive restarts.
- [x] **Step 5 — Llama Inference Service**
  - [x] Created `src/utils/promptTemplates.ts` (`formatChatPrompt`, supporting `chatml`, `llama3`, and `gemma` formats with system prompt injection).
  - [x] Created `src/services/llamaService.ts` (`loadModel`, `unloadModel`, `generateCompletion` with streaming token callback, `stopGeneration`, state subscriptions).
  - [x] Created `src/hooks/useLlama.ts` (React hook for reactive model lifecycle and streaming generation).
  - [x] Created unit tests `__tests__/promptTemplates.test.ts`.
- [ ] **Step 6 — Models Screen UI**
  - [ ] List catalog models with live status badges and progress bar.
  - [ ] Download, Pause, Resume, Delete, and Chat actions.
- [ ] **Step 7 — Chat Screen UI**
  - [ ] Bubble list with streaming assistant responses.
  - [ ] Input field, send button, stop generation, clear chat.
- [ ] **Step 8 — Navigation & Theme**
  - [ ] Stack navigator (Models -> Chat).
  - [ ] Light / Dark theme system support with manual override.

---

## Instructions to Verify Step 1

1. **TypeScript Verification**:
   ```bash
   npx tsc --noEmit
   ```
2. **Metro Bundler Verification**:
   ```bash
   npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output android/app/src/main/assets/index.android.bundle --assets-dest android/app/src/main/res/
   ```
3. **Android Device / Emulator Build**:
   Once JDK 17 and Android SDK / Android Studio are installed on your host:
   ```bash
   npx react-native run-android
   ```
