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

class KnowledgeService {
  /**
   * Open the native document picker to select a .txt or .md file,
   * chunk it, generate embeddings under ResourceGuard lock, and store in SQLite.
   */
  public async pickAndIndexDocument(): Promise<StoredDocument | null> {
    try {
      const pickerResult = await DocumentPicker.pickSingle({
        type: [types.plainText, types.allFiles],
        copyTo: 'cachesDirectory',
      });

      const fileUri = pickerResult.fileCopyUri || pickerResult.uri;
      const fileName = pickerResult.name || 'Untitled Document';
      const fileSize = pickerResult.size || 0;

      // Ensure file is supported text format
      const lower = fileName.toLowerCase();
      if (
        !lower.endsWith('.txt') &&
        !lower.endsWith('.md') &&
        !lower.endsWith('.json') &&
        !lower.endsWith('.csv')
      ) {
        throw new Error(
          'Please select a text document (.txt, .md, .json, or .csv).'
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
        statusText: 'Reading file contents...',
      });

      // Normalize URI path for Android
      let path = uri;
      if (path.startsWith('file://')) {
        path = path.slice(7);
      }

      const rawText = await RNFS.readFile(path, 'utf8');
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
