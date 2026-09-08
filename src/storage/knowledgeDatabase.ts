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
  private hasFTS5 = false;
  private initPromise: Promise<void> | null = null;

  private getRawDB(): DB {
    if (!this.db) {
      this.db = open({ name: 'pocketcortex_knowledge.db' });
    }
    return this.db;
  }

  public async ensureInitialized(): Promise<DB> {
    const db = this.getRawDB();
    if (this.isInitialized) {
      return db;
    }

    if (!this.initPromise) {
      this.initPromise = this.initTables(db);
    }
    await this.initPromise;
    return db;
  }

  private async initTables(db: DB): Promise<void> {
    try {
      // 1. Documents metadata table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          size INTEGER NOT NULL,
          chunk_count INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );
      `);

      // 2. Standard document_chunks table (guaranteed on all SQLite builds)
      await db.execute(`
        CREATE TABLE IF NOT EXISTS document_chunks (
          doc_id TEXT NOT NULL,
          chunk_index INTEGER NOT NULL,
          doc_name TEXT NOT NULL,
          content TEXT NOT NULL,
          PRIMARY KEY (doc_id, chunk_index)
        );
      `);

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_chunks_doc
        ON document_chunks(doc_id);
      `);

      // 3. Table for serialized vector embeddings
      await db.execute(`
        CREATE TABLE IF NOT EXISTS document_embeddings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          doc_id TEXT NOT NULL,
          chunk_index INTEGER NOT NULL,
          vector_json TEXT NOT NULL
        );
      `);

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_embeddings_doc
        ON document_embeddings(doc_id);
      `);

      // 4. Try creating FTS5 Virtual Table for BM25 full-text search
      try {
        await db.execute(`
          CREATE VIRTUAL TABLE IF NOT EXISTS document_chunks_fts USING fts5(
            doc_id UNINDEXED,
            chunk_index UNINDEXED,
            doc_name UNINDEXED,
            content,
            tokenize='porter unicode61'
          );
        `);
        this.hasFTS5 = true;
        console.log('[KnowledgeDatabase] Initialized FTS5 virtual table successfully.');
      } catch (ftsError) {
        this.hasFTS5 = false;
        console.warn(
          '[KnowledgeDatabase] FTS5 not available in this SQLite build, using standard SQL search fallback:',
          ftsError
        );
      }

      // 5. Clean up any ghost documents from previous incomplete imports
      try {
        await db.execute(`
          DELETE FROM documents
          WHERE id NOT IN (SELECT DISTINCT doc_id FROM document_chunks);
        `);
      } catch (pruneErr) {
        console.warn('[KnowledgeDatabase] Ghost document prune notice:', pruneErr);
      }

      this.isInitialized = true;
      console.log('[KnowledgeDatabase] All tables initialized successfully. FTS5 support:', this.hasFTS5);
    } catch (error) {
      console.error('[KnowledgeDatabase] Error initializing tables:', error);
      throw error;
    }
  }

  /**
   * Retrieve all indexed documents (only returning valid documents with stored chunks).
   */
  public async getDocuments(): Promise<StoredDocument[]> {
    try {
      const db = await this.ensureInitialized();
      const res = await db.execute(
        `SELECT d.id, d.name, d.size, d.chunk_count, d.created_at
         FROM documents d
         WHERE EXISTS (SELECT 1 FROM document_chunks c WHERE c.doc_id = d.id)
         ORDER BY d.created_at DESC;`
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
   * Delete a document and all of its chunks and embeddings safely.
   */
  public async deleteDocument(docId: string): Promise<void> {
    const db = await this.ensureInitialized();
    try {
      await db.execute('DELETE FROM documents WHERE id = ?;', [docId]).catch(() => {});
      await db.execute('DELETE FROM document_chunks WHERE doc_id = ?;', [docId]).catch(() => {});
      await db.execute('DELETE FROM document_embeddings WHERE doc_id = ?;', [docId]).catch(() => {});
      if (this.hasFTS5) {
        await db.execute('DELETE FROM document_chunks_fts WHERE doc_id = ?;', [docId]).catch(() => {});
      }
      console.log(`[KnowledgeDatabase] Deleted document ${docId}`);
    } catch (err) {
      console.error(`[KnowledgeDatabase] Error deleting document ${docId}:`, err);
      throw err;
    }
  }

  /**
   * Batch insert a document with its text chunks and optional embeddings.
   * Uses rollback on error so incomplete/failed imports never leave orphan docs.
   */
  public async insertDocument(
    doc: StoredDocument,
    chunks: ChunkInsertItem[]
  ): Promise<void> {
    const db = await this.ensureInitialized();

    try {
      // 1. Insert metadata
      await db.execute(
        'INSERT OR REPLACE INTO documents (id, name, size, chunk_count, created_at) VALUES (?, ?, ?, ?, ?);',
        [doc.id, doc.name, doc.size, doc.chunkCount, doc.createdAt]
      );

      // 2. Insert chunks into standard table, optional FTS5, and embeddings table
      for (const item of chunks) {
        // Standard reliable table
        await db.execute(
          'INSERT OR REPLACE INTO document_chunks (doc_id, chunk_index, doc_name, content) VALUES (?, ?, ?, ?);',
          [doc.id, item.chunkIndex, doc.name, item.content]
        );

        // FTS5 if supported
        if (this.hasFTS5) {
          try {
            await db.execute(
              'INSERT INTO document_chunks_fts (doc_id, chunk_index, doc_name, content) VALUES (?, ?, ?, ?);',
              [doc.id, item.chunkIndex, doc.name, item.content]
            );
          } catch (ftsErr) {
            console.warn('[KnowledgeDatabase] FTS5 insert chunk warning:', ftsErr);
          }
        }

        // Vector embeddings
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
      console.error(`[KnowledgeDatabase] Failed to insert document '${doc.name}', rolling back:`, err);
      // Clean rollback on failure
      await this.deleteDocument(doc.id).catch(() => {});
      throw err;
    }
  }

  /**
   * Hybrid Search: Combines Lexical ranking (FTS5 BM25 or token matching)
   * with Semantic Vector Similarity using Reciprocal Rank Fusion (RRF).
   */
  public async hybridSearch(query: string, limit: number = 3): Promise<GroundedSource[]> {
    const db = await this.ensureInitialized();
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

    // 1. Lexical Search
    let lexicalSuccess = false;
    if (this.hasFTS5) {
      try {
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

          if (bm25Res.rows && bm25Res.rows.length > 0) {
            lexicalSuccess = true;
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
        console.warn('[KnowledgeDatabase] FTS5 BM25 search warning, falling back to SQL token match:', bm25Err);
      }
    }

    // Fallback Lexical search using standard document_chunks if FTS5 not present or yielded 0 hits
    if (!lexicalSuccess) {
      try {
        const terms = cleanQuery
          .replace(/[^\w\s]/gi, ' ')
          .toLowerCase()
          .split(/\s+/)
          .filter(w => w.length > 1);

        if (terms.length > 0) {
          // Build query matching any term
          const whereClauses = terms.map(() => '(LOWER(content) LIKE ? OR LOWER(doc_name) LIKE ?)').join(' OR ');
          const params: string[] = [];
          terms.forEach(t => {
            const wildcard = `%${t}%`;
            params.push(wildcard, wildcard);
          });

          const res = await db.execute(
            `SELECT doc_id, chunk_index, doc_name, content
             FROM document_chunks
             WHERE ${whereClauses}
             LIMIT 30;`,
            params
          );

          if (res.rows && res.rows.length > 0) {
            // Score by number of matched terms
            const scored: Array<{
              docId: string;
              chunkIndex: number;
              docName: string;
              excerpt: string;
              matchScore: number;
            }> = [];

            for (let i = 0; i < res.rows.length; i++) {
              const r = res.rows[i];
              const lowerContent = String(r.content).toLowerCase();
              const lowerDocName = String(r.doc_name).toLowerCase();
              let count = 0;
              for (const term of terms) {
                if (lowerContent.includes(term)) count += 1;
                if (lowerDocName.includes(term)) count += 2;
              }
              scored.push({
                docId: String(r.doc_id),
                chunkIndex: Number(r.chunk_index),
                docName: String(r.doc_name),
                excerpt: String(r.content),
                matchScore: count,
              });
            }

            scored.sort((a, b) => b.matchScore - a.matchScore);
            scored.slice(0, 15).forEach((item, idx) => {
              const key = `${item.docId}_${item.chunkIndex}`;
              candidateMap.set(key, {
                docId: item.docId,
                chunkIndex: item.chunkIndex,
                docName: item.docName,
                excerpt: item.excerpt,
                bm25Rank: idx + 1,
              });
            });
          }
        }
      } catch (fallbackErr) {
        console.warn('[KnowledgeDatabase] Fallback token search error:', fallbackErr);
      }
    }

    // 2. Semantic Vector Search (joined to standard document_chunks, NOT fts)
    try {
      const isEmbedModelReady = await embeddingService.isEmbeddingModelDownloaded();
      if (isEmbedModelReady) {
        const queryVector = await embeddingService.computeEmbedding(cleanQuery);
        if (queryVector.length > 0) {
          const embRes = await db.execute(
            'SELECT e.doc_id, e.chunk_index, e.vector_json, f.doc_name, f.content ' +
            'FROM document_embeddings e ' +
            'JOIN document_chunks f ON e.doc_id = f.doc_id AND e.chunk_index = f.chunk_index;'
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

    // If no specific keyword/vector matches and user asks general questions about documents
    if (scoredList.length === 0) {
      const isDocQuery = /\b(doc|docs|document|documents|file|files|upload|uploaded|summary|summarize|notes|content|contents|info|information|wiki|paper|text|read|tell me|explain)\b/i.test(cleanQuery);
      if (isDocQuery) {
        try {
          const fallbackRes = await db.execute(
            `SELECT doc_id, chunk_index, doc_name, content
             FROM document_chunks
             ORDER BY chunk_index ASC
             LIMIT ?;`,
            [limit]
          );
          if (fallbackRes.rows && fallbackRes.rows.length > 0) {
            for (let i = 0; i < fallbackRes.rows.length; i++) {
              const r = fallbackRes.rows[i];
              scoredList.push({
                docId: String(r.doc_id),
                docName: String(r.doc_name),
                chunkIndex: Number(r.chunk_index),
                excerpt: String(r.content),
                score: 0.01,
              });
            }
          }
        } catch (err) {
          console.warn('[KnowledgeDatabase] Exploratory fallback search warning:', err);
        }
      }
    }

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
