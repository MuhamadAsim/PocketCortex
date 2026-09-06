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
- [ ] **Step 2 — Types & Model Catalog**
  - [ ] Create `src/types/models.ts` (`ModelDefinition`, `DownloadStatus`, `ChatMessage`).
  - [ ] Create `src/constants/modelCatalog.ts` with the 3 verified models.
- [ ] **Step 3 — MMKV Storage Layer**
  - [ ] Create `src/storage/mmkv.ts` (single MMKV instance).
  - [ ] Create `src/storage/modelStorage.ts` (downloaded models, local paths, progress).
  - [ ] Create `src/storage/chatStorage.ts` (conversation history per model).
- [ ] **Step 4 — Download Manager**
  - [ ] Create `src/services/downloadManager.ts` (start, progress, pause, resume with Range headers, delete).
  - [ ] Persist progress state in MMKV across restarts.
- [ ] **Step 5 — Llama Inference Service**
  - [ ] Create `src/services/llamaService.ts` (`loadModel`, `unloadModel`, `sendMessage` with streaming token callback).
  - [ ] Prompt template formatting per model.
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
