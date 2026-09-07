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
| **Moondream 2 (Vision)** | `vikhyatk/moondream2` | `moondream2-text-model-f16.gguf` | `https://huggingface.co/vikhyatk/moondream2/resolve/main/moondream2-text-model-f16.gguf` |
| **Moondream 2 (Vision Projector)** | `vikhyatk/moondream2` | `moondream2-mmproj-f16.gguf` | `https://huggingface.co/vikhyatk/moondream2/resolve/main/moondream2-mmproj-f16.gguf` |
| **All-MiniLM-L6-v2 (Embedding)** | `leliuga/all-MiniLM-L6-v2-GGUF` | `all-MiniLM-L6-v2.Q4_K_M.gguf` | `https://huggingface.co/leliuga/all-MiniLM-L6-v2-GGUF/resolve/main/all-MiniLM-L6-v2.Q4_K_M.gguf` |

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
- [x] **Step 6 — Models Screen UI**
  - [x] Created `src/theme/theme.ts` (obsidian dark mode, light mode, typography scale, spacing, radius).
  - [x] Created `src/theme/ThemeContext.tsx` (`ThemeProvider` and `useTheme` hook with auto-detection & MMKV persistence).
  - [x] Created `src/components/ModelCard.tsx` (rich card with parameter badges, live progress bar, pause/resume/delete, and chat action).
  - [x] Created `src/screens/ModelsScreen.tsx` (header, storage summary metric, RAM status card with unload, pull-to-refresh disk sync).
  - [x] Updated `App.tsx` to render `ThemeProvider` and `ModelsScreen`.
- [x] **Step 7 — Chat Screen UI**
  - [x] Created `src/components/ChatBubble.tsx` (user and assistant bubbles with speech styling, streaming cursor, model tag, timestamp).
  - [x] Created `src/screens/ChatScreen.tsx` (live streaming FlatList, auto-scrolling, starter suggestions, multi-line auto-growing input, stop generation, clear chat).
  - [x] Connected MMKV chat storage (`chatStorage.ts`) for instant conversation persistence.
  - [x] Updated `App.tsx` with smooth screen switching between ModelsScreen and ChatScreen.
- [x] **Step 8 — Navigation & Theme**
  - [x] Created `src/navigation/types.ts` (`RootStackParamList`, type-safe navigation props).
  - [x] Created `src/navigation/AppNavigator.tsx` (React Navigation Native Stack with custom theme & slide animations).
  - [x] Updated `ModelsScreen.tsx` and `ChatScreen.tsx` to integrate with Native Stack.
  - [x] Updated `App.tsx` to mount `AppNavigator`.
- [x] **Step 9 — On-Device Hybrid RAG, ResourceGuard & Moondream 2 Vision**
  - [x] Installed and configured `@op-engineering/op-sqlite` (C++ SQLite with FTS5) and `react-native-document-picker`.
  - [x] Created `src/services/resourceGuard.ts` & `src/hooks/useResourceGuard.ts` for crash prevention (mutual exclusion between indexing and inference).
  - [x] Created `src/storage/knowledgeDatabase.ts` (SQLite FTS5 BM25 search, vector embeddings store, Reciprocal Rank Fusion).
  - [x] Created `src/services/embeddingService.ts` (`all-MiniLM-L6-v2.gguf` on-device vector embedding model via `llama.rn`).
  - [x] Created `src/services/knowledgeService.ts` (file picker for `.txt`, `.md`, `.json`, `.csv`, text chunking with 50-word overlap).
  - [x] Integrated Moondream 2 (~1.86B) multimodal vision model with paired `moondream2-mmproj-f16.gguf` download and inference.
  - [x] Created `src/screens/KnowledgeScreen.tsx` for file management, chunk metrics, and embedding status.
  - [x] Updated `ChatScreen.tsx` with search toggle, camera image attach, thumbnail preview, and grounded context injection.
  - [x] Updated `ChatBubble.tsx` with image preview and collapsible `📚 X Sources Grounded` card.
  - [x] Verified zero TypeScript errors (`npx tsc --noEmit`), passed all Jest unit tests (`npm test`), and verified clean Metro packaging.
  - [x] Created `patches/react-native-document-picker+9.3.1.patch` via `patch-package` to replace removed `GuardedResultAsyncTask` with standard `ExecutorService` for React Native 0.87+ Android compilation.

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
