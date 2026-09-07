# PocketLLM: On-Device File Knowledge Base & Offline Wikipedia Search (RAG)
**Architecture & Implementation Plan**

---

## 1. Executive Summary

This document outlines the architecture and implementation roadmap for adding **On-Device Retrieval-Augmented Generation (RAG)** and **Local Knowledge Search** to PocketLLM.

With this capability, users will be able to:
1. **Upload / Import Documents**: PDF, TXT, Markdown, EPUB, or offline Wikipedia articles/dumps.
2. **Offline Intelligent Search**: Fast full-text and semantic search running 100% locally on the device (CPU/NPU).
3. **Grounded LLM Responses (RAG)**: When chatting, the LLM retrieves relevant excerpts from the user's files and uses them to answer questions with verifiable source citations—functioning like an on-device, offline Google/Perplexity.

---

## 2. Technical Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             USER INTERACTION                                │
│                                                                             │
│  [ Upload File / Wiki Dump ]         [ User Prompt: "What did Einstein..."] │
└──────────────────────┬──────────────────────────────────────┬───────────────┘
                       │                                      │
                       ▼                                      ▼
        ┌─────────────────────────────┐        ┌─────────────────────────────┐
        │   Document Ingestion &      │        │      Query Processing       │
        │   Chunking Engine           │        │   & Keyword / Vector Query  │
        │                             │        └──────────────┬──────────────┘
        │ • Extract text from files   │                       │
        │ • Chunk: 350 tokens         │                       ▼
        │ • Overlap: 50 tokens        │        ┌─────────────────────────────┐
        └──────────────┬──────────────┘        │   On-Device Search Engine   │
                       │                       │                             │
                       ▼                       │ • SQLite FTS5 (BM25 Search) │
        ┌─────────────────────────────┐        │ • (Optional) Embeddings     │
        │ Local Knowledge Store (DB)  │◄───────┤ • Fast Top-K Retrieval      │
        │                             │        └──────────────┬──────────────┘
        │ • Chunks, Titles, Metadata  │                       │
        │ • Stored in SQLite / MMKV   │                       │ [Top 3-5 Chunks]
        └─────────────────────────────┘                       ▼
                                               ┌─────────────────────────────┐
                                               │      RAG Prompt Builder     │
                                               │                             │
                                               │ Injects chunks + citations  │
                                               │ into model chat template    │
                                               └──────────────┬──────────────┘
                                                              │
                                                              ▼
                                               ┌─────────────────────────────┐
                                               │    Local LLM Inference      │
                                               │          (llama.rn)         │
                                               │                             │
                                               │ Streams answer + references │
                                               └─────────────────────────────┘
```

---

## 3. Core Engine Components

### 3.1 Document Ingestion & Text Extraction
- **Supported Formats**:
  - Plain Text (`.txt`), Markdown (`.md`), JSON (`.json`)
  - PDF (`.pdf`) via lightweight native text extractors
  - Wikipedia Dumps (Kiwix `.zim` files or structured Wikipedia JSON/XML excerpts)
- **Chunking Pipeline**:
  - Splits documents into manageable segments of **300–500 tokens** (around 1,200–2,000 characters).
  - Uses an overlap of **50 tokens** to prevent losing context across chunk boundaries.
  - Generates metadata: Document Name, Section/Header, Page Number, and Chunk ID.

---

### 3.2 Search & Retrieval Strategy (Tailored for Mobile)

On mobile devices with constrained RAM (4GB–8GB), we recommend a **hybrid approach** starting with high-speed BM25 full-text indexing:

#### Option A: High-Performance SQLite FTS5 (Zero Extra RAM Overhead - Recommended for Phase 1)
- **How it works**: Uses SQLite's built-in `FTS5` (Full-Text Search 5) extension with Porter stemming and BM25 ranking algorithm.
- **RAM Footprint**: **0 MB extra RAM** (runs directly against flash storage via standard SQLite).
- **Search Speed**: < 10 milliseconds across tens of thousands of document chunks.
- **Storage Footprint**: Very small (~10-15% of raw text size).
- **Why it's great**: Allows searching hundreds of megabytes of Wikipedia articles or books without consuming RAM needed by the 3B/1B LLM!

#### Option B: On-Device Vector Embeddings (Semantic Search - Phase 2)
- **Model**: Ultra-compact embedding model (e.g., `bge-micro-v2` or `all-MiniLM-L6-v2`, ~25MB quantized).
- **Vector Store**: `sqlite-vec` or local HNSW index running via C++.
- **Hybrid Fusion**: Combines BM25 keyword matching (exact names, dates, quotes) with Semantic Vector search (concepts, meanings).

---

### 3.3 RAG Prompt Engineering with Source Attribution

When the user enables "Search Documents / Wikipedia", the prompt formatter injects the retrieved context:

```
<|im_start|>system
You are a knowledgeable assistant with access to local documents.
Answer the user's question using the provided source excerpts below.
If the excerpts do not contain the answer, state that clearly.
Always cite the source using [Doc: X, Section: Y] tags.

--- SOURCE EXCERPTS ---
[Source 1]: "Document: Wikipedia - Theory of Relativity.txt"
Excerpt: "Albert Einstein published the special theory of relativity in 1905..."

[Source 2]: "Document: Physics_Notes.pdf (Page 14)"
Excerpt: "The equation E = mc^2 establishes the equivalence of mass and energy..."
------------------------<|im_end|>

<|im_start|>user
What did Einstein publish in 1905?<|im_end|>

<|im_start|>assistant
In 1905, Albert Einstein published his special theory of relativity [Source 1]...
```

---

## 4. User Experience & Interface Design

### 4.1 "Knowledge Base" Management Tab / Modal
1. **File Ingestion Card**:
   - "Add Document / Wikipedia Archive" button.
   - Supports file picking via `react-native-document-picker`.
   - Real-time indexing progress bar (`"Extracting & Indexing: 45%"`, chunks created, total words).
2. **Indexed Documents List**:
   - Displays each document with its size, number of chunks, and an "Active / Inactive" toggle.
   - Quick Delete button to reclaim disk space.

### 4.2 Enhanced Chat Screen (Search Mode)
1. **Knowledge Toggle Pill** in Chat Header:
   - `[ 🔍 Search Docs: ON ]` toggle.
   - When ON, questions automatically query the index.
2. **"Sources Used" Accordion Card**:
   - Below the assistant bubble, a collapsible chip appears: `"📚 3 Sources Referenced"`.
   - Tapping it reveals the exact excerpts and document names that contributed to the answer.
3. **Clickable Citations**:
   - Citations like `[Source 1]` inside the message text are highlighted as tap-targets.

---

## 5. Mobile Feasibility & Performance Analysis

| Metric | Estimation | Feasibility |
| :--- | :--- | :--- |
| **Indexing Speed** | ~1,000 pages / minute on modern Snapdragon/MediaTek | Highly feasible |
| **Search Latency** | 5ms to 25ms using SQLite FTS5 | Instantaneous |
| **RAM Usage during Search** | Less than 15 MB for SQLite search | Zero interference with LLM |
| **Storage Usage** | 100 MB text book = ~12 MB index | Very compact |
| **Battery Consumption** | Search takes negligible power; LLM inference is standard | Negligible overhead |

---

## 6. Implementation Roadmap

### Phase 1: Local Document Storage & Fast FTS5 Search
- [ ] Add `react-native-quick-sqlite` or `op-sqlite` for high-speed local SQLite database with `FTS5` enabled.
- [ ] Create `src/services/knowledgeService.ts`:
  - Table schema: `documents` (id, title, size, date) and `document_chunks_fts` (doc_id, chunk_index, content).
  - Chunking utility: `chunkText(text, chunkSize, overlap)`.
  - Search function: `searchKnowledge(query, limit = 4)`.
- [ ] Add `react-native-document-picker` for selecting `.txt`, `.md`, and `.pdf` files from phone storage.

### Phase 2: RAG Context Assembly in Chat
- [ ] Integrate retrieval into `src/screens/ChatScreen.tsx`:
  - When sending a query, first invoke `searchKnowledge(inputText)`.
  - If matches found, format and inject chunks into the prompt context via `src/utils/promptTemplates.ts`.
- [ ] Display references and citation chips in `ChatBubble.tsx`.

### Phase 3: Offline Wikipedia Dump Support (Kiwix / ZIM)
- [ ] Integrate parser for lightweight Wikipedia topical bundles (e.g. Science, History, Medicine) or compressed dumps.
- [ ] Allow one-tap downloading of curated offline Wikipedia knowledge packs directly inside PocketLLM.

### Phase 4: Semantic Embeddings (Optional Hybrid Search)
- [ ] Add on-device embeddings via `llama.rn` embedding mode or a micro ONNX/TFLite model.
- [ ] Re-rank BM25 results with vector similarity for even higher precision.

---

## 7. Conclusion
Building on-device document search and offline Wikipedia access into PocketLLM is **100% technically feasible on Android**. By adopting an SQLite FTS5 retrieval pipeline for Phase 1, the app gains instant, private, offline search without consuming the RAM needed by the local LLM.
