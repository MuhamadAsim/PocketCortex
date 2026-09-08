import { open, DB, QueryResult } from '@op-engineering/op-sqlite';
import { GroundedSource } from '../types/models';
import { embeddingService } from '../services/embeddingService';

export interface StoredDocument {
  id: string;
  name: string;
  size: number;
  chunkCount: number;
  createdAt: number;
}

export interface ChunkInsertItem {
  chunkIndex: number;
  content: string;
  vector?: number[];
}

class KnowledgeDatabase {
  private db: DB | null = null;
  private isInitialized = false;

  private getDB(): DB {
    if (!this.db) {
      this.db = open({ name: 'pocketcortex_knowledge.db' });
      this.initTables();
    }
    return this.db;
  }

  private initTables() {
    if (this.isInitialized || !this.db) return;

    try {
      // 1. Documents metadata table
      this.db.execute(`
        CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          size INTEGER NOT NULL,
          chunk_count INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );
      `);

      // 2. FTS5 Virtual Table for BM25 full-text search
      this.db.execute(`
        CREATE VIRTUAL TABLE IF NOT EXISTS document_chunks_fts USING fts5(
          doc_id UNINDEXED,
          chunk_index UNINDEXED,
          doc_name UNINDEXED,
          content,
          tokenize='porter unicode61'
        );
      `);

      // 3. Table for serialized vector embeddings
      this.db.execute(`
        CREATE TABLE IF NOT EXISTS document_embeddings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          doc_id TEXT NOT NULL,
          chunk_index INTEGER NOT NULL,
          vector_json TEXT NOT NULL
        );
      `);

      // Index for fast lookups
      this.db.execute(`
        CREATE INDEX IF NOT EXISTS idx_embeddings_doc
        ON document_embeddings(doc_id);
      `);

      this.isInitialized = true;
      console.log('[KnowledgeDatabase] Initialized tables successfully.');
    } catch (error) {
      console.error('[KnowledgeDatabase] Error initializing tables:', error);
    }
  }

  /**
   * Retrieve all indexed documents.
   */
  public async getDocuments(): Promise<StoredDocument[]> {
    const db = this.getDB();
    try {
      const res = await db.execute(
        'SELECT id, name, size, chunk_count, created_at FROM documents ORDER BY created_at DESC;'
      );
      const docs: StoredDocument[] = [];
      if (res.rows) {
        for (let i = 0; i < res.rows.length; i++) {
          const r = res.rows[i];
          docs.push({
            id: String(r.id),
            name: String(r.name),
            size: Number(r.size),
            chunkCount: Number(r.chunk_count),
            createdAt: Number(r.created_at),
          });
        }
      }
      return docs;
    } catch (err) {
      console.error('[KnowledgeDatabase] Error fetching documents:', err);
      return [];
    }
  }

  /**
   * Delete a document and all of its chunks and embeddings.
   */
  public async deleteDocument(docId: string): Promise<void> {
    const db = this.getDB();
    try {
      await db.execute('DELETE FROM documents WHERE id = ?;', [docId]);
      await db.execute('DELETE FROM document_chunks_fts WHERE doc_id = ?;', [docId]);
      await db.execute('DELETE FROM document_embeddings WHERE doc_id = ?;', [docId]);
      console.log(`[KnowledgeDatabase] Deleted document ${docId}`);
    } catch (err) {
      console.error(`[KnowledgeDatabase] Error deleting document ${docId}:`, err);
      throw err;
    }
  }

  /**
   * Batch insert a document with its text chunks and optional embeddings.
   */
  public async insertDocument(
    doc: StoredDocument,
    chunks: ChunkInsertItem[]
  ): Promise<void> {
    const db = this.getDB();

    try {
      // 1. Insert metadata
      await db.execute(
        'INSERT OR REPLACE INTO documents (id, name, size, chunk_count, created_at) VALUES (?, ?, ?, ?, ?);',
        [doc.id, doc.name, doc.size, doc.chunkCount, doc.createdAt]
      );

      // 2. Insert chunks into FTS5 and embeddings table
      for (const item of chunks) {
        await db.execute(
          'INSERT INTO document_chunks_fts (doc_id, chunk_index, doc_name, content) VALUES (?, ?, ?, ?);',
          [doc.id, item.chunkIndex, doc.name, item.content]
        );

        if (item.vector && item.vector.length > 0) {
          const vectorJson = JSON.stringify(item.vector);
          await db.execute(
            'INSERT INTO document_embeddings (doc_id, chunk_index, vector_json) VALUES (?, ?, ?);',
            [doc.id, item.chunkIndex, vectorJson]
          );
        }
      }

      console.log(`[KnowledgeDatabase] Successfully indexed document '${doc.name}' (${chunks.length} chunks)`);
    } catch (err) {
      console.error(`[KnowledgeDatabase] Failed to insert document '${doc.name}':`, err);
      throw err;
    }
  }

  /**
   * Hybrid Search: Combines BM25 lexical ranking with Semantic Vector Similarity
   * using Reciprocal Rank Fusion (RRF).
   */
  public async hybridSearch(query: string, limit: number = 3): Promise<GroundedSource[]> {
    const db = this.getDB();
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    // Map: chunkKey -> { docId, chunkIndex, docName, excerpt, bm25Rank?, vectorRank? }
    const candidateMap = new Map<
      string,
      {
        docId: string;
        chunkIndex: number;
        docName: string;
        excerpt: string;
        bm25Rank?: number;
        vectorRank?: number;
      }
    >();

    // 1. Lexical BM25 Search
    try {
      // Clean query for FTS5 syntax: replace punctuation with space, format terms
      const sanitized = cleanQuery
        .replace(/[^\w\s]/gi, ' ')
        .trim()
        .split(/\s+/)
        .filter(w => w.length > 0)
        .map(w => `"${w}"*`)
        .join(' OR ');

      if (sanitized) {
        const bm25Res = await db.execute(
          `SELECT doc_id, chunk_index, doc_name, content, rank
           FROM document_chunks_fts
           WHERE document_chunks_fts MATCH ?
           ORDER BY rank
           LIMIT 15;`,
          [sanitized]
        );

        if (bm25Res.rows) {
          for (let i = 0; i < bm25Res.rows.length; i++) {
            const r = bm25Res.rows[i];
            const key = `${r.doc_id}_${r.chunk_index}`;
            candidateMap.set(key, {
              docId: String(r.doc_id),
              chunkIndex: Number(r.chunk_index),
              docName: String(r.doc_name),
              excerpt: String(r.content),
              bm25Rank: i + 1,
            });
          }
        }
      }
    } catch (bm25Err) {
      console.warn('[KnowledgeDatabase] BM25 search warning (falling back to vector search):', bm25Err);
    }

    // 2. Semantic Vector Search
    try {
      const isEmbedModelReady = await embeddingService.isEmbeddingModelDownloaded();
      if (isEmbedModelReady) {
        const queryVector = await embeddingService.computeEmbedding(cleanQuery);
        if (queryVector.length > 0) {
          // Fetch all stored embeddings to calculate similarity
          const embRes = await db.execute(
            'SELECT e.doc_id, e.chunk_index, e.vector_json, f.doc_name, f.content ' +
            'FROM document_embeddings e ' +
            'JOIN document_chunks_fts f ON e.doc_id = f.doc_id AND e.chunk_index = f.chunk_index;'
          );

          if (embRes.rows && embRes.rows.length > 0) {
            const vectorScored: Array<{
              docId: string;
              chunkIndex: number;
              docName: string;
              excerpt: string;
              similarity: number;
            }> = [];

            for (let i = 0; i < embRes.rows.length; i++) {
              const row = embRes.rows[i];
              try {
                const vec = JSON.parse(String(row.vector_json));
                const similarity = embeddingService.cosineSimilarity(queryVector, vec);
                vectorScored.push({
                  docId: String(row.doc_id),
                  chunkIndex: Number(row.chunk_index),
                  docName: String(row.doc_name),
                  excerpt: String(row.content),
                  similarity,
                });
              } catch {
                // skip malformed vector
              }
            }

            // Sort descending by similarity
            vectorScored.sort((a, b) => b.similarity - a.similarity);

            // Assign vector rank to top 15 candidates
            const topVectorCandidates = vectorScored.slice(0, 15);
            topVectorCandidates.forEach((item, idx) => {
              const key = `${item.docId}_${item.chunkIndex}`;
              const existing = candidateMap.get(key);
              if (existing) {
                existing.vectorRank = idx + 1;
              } else {
                candidateMap.set(key, {
                  docId: item.docId,
                  chunkIndex: item.chunkIndex,
                  docName: item.docName,
                  excerpt: item.excerpt,
                  vectorRank: idx + 1,
                });
              }
            });
          }
        }
      }
    } catch (vecErr) {
      console.warn('[KnowledgeDatabase] Vector search warning:', vecErr);
    }

    // 3. Reciprocal Rank Fusion (RRF)
    // Score(d) = 1 / (60 + BM25_Rank) + 1 / (60 + Vector_Rank)
    const scoredList: Array<{
      docId: string;
      docName: string;
      chunkIndex: number;
      excerpt: string;
      score: number;
    }> = [];

    const k = 60; // Standard RRF smoothing factor

    candidateMap.forEach(item => {
      let rrfScore = 0;
      if (item.bm25Rank) {
        rrfScore += 1 / (k + item.bm25Rank);
      }
      if (item.vectorRank) {
        rrfScore += 1 / (k + item.vectorRank);
      }
      scoredList.push({
        docId: item.docId,
        docName: item.docName,
        chunkIndex: item.chunkIndex,
        excerpt: item.excerpt,
        score: rrfScore,
      });
    });

    // Sort descending by RRF score
    scoredList.sort((a, b) => b.score - a.score);

    return scoredList.slice(0, limit).map(item => ({
      docId: item.docId,
      docName: item.docName,
      chunkIndex: item.chunkIndex,
      excerpt: item.excerpt,
      score: Number(item.score.toFixed(4)),
    }));
  }
}

export const knowledgeDatabase = new KnowledgeDatabase();
