import * as RNFS from '@dr.pogodin/react-native-fs';
import DocumentPicker, { types } from 'react-native-document-picker';
import {
  knowledgeDatabase,
  StoredDocument,
  ChunkInsertItem,
} from '../storage/knowledgeDatabase';
import { embeddingService } from './embeddingService';
import { resourceGuard } from './resourceGuard';
import { GroundedSource } from '../types/models';
import { extractDocxText } from '../utils/docxExtractor';
import { extractPdfText } from '../native/PdfTextExtractor';

export function chunkText(
  text: string,
  wordsPerChunk: number = 300,
  overlapWords: number = 50
): string[] {
  const clean = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!clean) return [];

  // Split into words preserving whitespace structure
  const words = clean.split(/\s+/);
  if (words.length <= wordsPerChunk) {
    return [clean];
  }

  const chunks: string[] = [];
  let startIndex = 0;

  while (startIndex < words.length) {
    const endIndex = Math.min(startIndex + wordsPerChunk, words.length);
    const chunkWords = words.slice(startIndex, endIndex);
    chunks.push(chunkWords.join(' '));

    if (endIndex >= words.length) {
      break;
    }
    startIndex += wordsPerChunk - overlapWords;
  }

  return chunks;
}

/**
 * Resolves a file URI to a filesystem path.
 * On Android, if a content:// URI is passed, copies to cache directory for native file access.
 */
export async function resolveFilePath(uri: string, fileName: string): Promise<string> {
  if (uri.startsWith('file://')) {
    return uri.slice(7);
  }

  if (uri.startsWith('content://')) {
    const safeName = fileName
      ? fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
      : `doc_${Date.now()}`;
    const destination = `${RNFS.CachesDirectoryPath}/${safeName}`;
    try {
      if (await RNFS.exists(destination)) {
        await RNFS.unlink(destination);
      }
      await RNFS.copyFile(uri, destination);
      return destination;
    } catch (copyErr) {
      console.warn('[KnowledgeService] Failed to copy content:// URI via RNFS:', copyErr);
      return uri;
    }
  }

  return uri;
}

/**
 * Extracts plain text from a supported file URI (.docx, .pdf, .txt, .md, .json, .csv).
 * Dispatches to native PDFBox for PDF, JSZip+fast-xml-parser for DOCX, and RNFS for text.
 */
export async function extractTextFromFile(
  uri: string,
  fileName: string
): Promise<string> {
  const resolvedPath = await resolveFilePath(uri, fileName);
  const lower = fileName.toLowerCase();

  if (lower.endsWith('.docx')) {
    return await extractDocxText(resolvedPath);
  }

  if (lower.endsWith('.pdf')) {
    const result = await extractPdfText(resolvedPath);
    if (result.isLikelyScanned) {
      throw new Error(
        `Failed to import "${fileName}" (${result.pageCount} pages): Document appears to be a scanned image or empty. OCR import is not supported yet.`
      );
    }
    if (!result.text || !result.text.trim()) {
      throw new Error(
        `Failed to import "${fileName}": No text could be extracted from this PDF.`
      );
    }
    return result.text;
  }

  if (
    lower.endsWith('.txt') ||
    lower.endsWith('.md') ||
    lower.endsWith('.json') ||
    lower.endsWith('.csv')
  ) {
    return await RNFS.readFile(resolvedPath, 'utf8');
  }

  throw new Error(
    `Unsupported document format for "${fileName}". Supported formats: .docx, .pdf, .txt, .md, .json, .csv.`
  );
}

class KnowledgeService {
  /**
   * Open the native document picker to select a document (.docx, .pdf, .txt, .md, .json, .csv),
   * chunk it, generate embeddings under ResourceGuard lock, and store in SQLite.
   */
  public async pickAndIndexDocument(): Promise<StoredDocument | null> {
    try {
      const pickerResult = await DocumentPicker.pickSingle({
        type: [
          types.plainText,
          types.pdf,
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          types.allFiles,
        ],
        copyTo: 'cachesDirectory',
      });

      const fileUri = pickerResult.fileCopyUri || pickerResult.uri;
      const fileName = pickerResult.name || 'Untitled Document';
      const fileSize = pickerResult.size || 0;

      // Ensure file is supported document format
      const lower = fileName.toLowerCase();
      if (
        !lower.endsWith('.txt') &&
        !lower.endsWith('.md') &&
        !lower.endsWith('.json') &&
        !lower.endsWith('.csv') &&
        !lower.endsWith('.docx') &&
        !lower.endsWith('.pdf')
      ) {
        throw new Error(
          'Please select a supported document (.docx, .pdf, .txt, .md, .json, or .csv).'
        );
      }

      return await this.indexDocumentFromUri(fileUri, fileName, fileSize);
    } catch (err: any) {
      if (DocumentPicker.isCancel(err)) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Ingest and index a document from a local file URI.
   */
  public async indexDocumentFromUri(
    uri: string,
    fileName: string,
    fileSize: number
  ): Promise<StoredDocument> {
    const docId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // 1. Acquire ResourceGuard indexing lock (unloads any active chat LLM)
    await resourceGuard.acquireIndexingLock(`Indexing ${fileName}`);

    try {
      resourceGuard.updateIndexingProgress({
        percent: 5,
        statusText: `Extracting text from ${fileName}...`,
      });

      const rawText = await extractTextFromFile(uri, fileName);
      if (!rawText.trim()) {
        throw new Error('Selected document is empty.');
      }

      resourceGuard.updateIndexingProgress({
        percent: 15,
        statusText: 'Splitting into chunks...',
      });

      // 2. Chunk text
      const textChunks = chunkText(rawText, 300, 50);
      const totalChunks = textChunks.length;
      console.log(`[KnowledgeService] Generated ${totalChunks} chunks for ${fileName}`);

      // 3. Check if embedding model is downloaded
      const hasEmbedModel = await embeddingService.isEmbeddingModelDownloaded();
      const chunkItems: ChunkInsertItem[] = [];

      for (let i = 0; i < totalChunks; i++) {
        const chunk = textChunks[i];
        let vector: number[] | undefined;

        if (hasEmbedModel) {
          const percent = 20 + Math.round(((i + 1) / totalChunks) * 65);
          resourceGuard.updateIndexingProgress({
            percent,
            statusText: `Embedding chunk ${i + 1}/${totalChunks}...`,
            currentChunk: i + 1,
            totalChunks,
          });

          try {
            vector = await embeddingService.computeEmbedding(chunk);
          } catch (embedErr) {
            console.warn(`[KnowledgeService] Failed to embed chunk ${i}:`, embedErr);
          }
        } else {
          // Pure BM25 without vector embedding
          const percent = 20 + Math.round(((i + 1) / totalChunks) * 70);
          resourceGuard.updateIndexingProgress({
            percent,
            statusText: `Processing chunk ${i + 1}/${totalChunks}...`,
            currentChunk: i + 1,
            totalChunks,
          });
        }

        chunkItems.push({
          chunkIndex: i,
          content: chunk,
          vector,
        });
      }

      resourceGuard.updateIndexingProgress({
        percent: 90,
        statusText: 'Writing to SQLite database...',
      });

      const doc: StoredDocument = {
        id: docId,
        name: fileName,
        size: fileSize || rawText.length,
        chunkCount: totalChunks,
        createdAt: Date.now(),
      };

      // 4. Save to database
      await knowledgeDatabase.insertDocument(doc, chunkItems);

      // 5. Release embedding model context to free memory
      await embeddingService.releaseContext();

      resourceGuard.updateIndexingProgress({
        percent: 100,
        statusText: 'Done!',
      });

      return doc;
    } catch (err: any) {
      console.error('[KnowledgeService] Error during indexing:', err);
      throw err;
    } finally {
      // Always release lock when finished
      resourceGuard.releaseIndexingLock();
    }
  }

  public async getDocuments(): Promise<StoredDocument[]> {
    return await knowledgeDatabase.getDocuments();
  }

  public async deleteDocument(docId: string): Promise<void> {
    return await knowledgeDatabase.deleteDocument(docId);
  }

  public async searchKnowledge(
    query: string,
    limit: number = 3
  ): Promise<GroundedSource[]> {
    return await knowledgeDatabase.hybridSearch(query, limit);
  }
}

export const knowledgeService = new KnowledgeService();
