import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { spacing, radius, typography } from '../theme/theme';
import { knowledgeService } from '../services/knowledgeService';
import { StoredDocument } from '../storage/knowledgeDatabase';
import { useResourceGuard } from '../hooks/useResourceGuard';
import { embeddingService } from '../services/embeddingService';
import { EMBEDDING_MODEL, formatBytes } from '../constants/modelCatalog';
import { startDownload, subscribeDownload, getDownloadState } from '../services/downloadManager';

export const KnowledgeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const resourceState = useResourceGuard();

  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [hasEmbedModel, setHasEmbedModel] = useState(false);
  const [embedDownloadStatus, setEmbedDownloadStatus] = useState<string>('not_downloaded');
  const [embedDownloadPercent, setEmbedDownloadPercent] = useState<number>(0);

  const loadDocs = useCallback(async () => {
    try {
      setIsLoadingDocs(true);
      const docs = await knowledgeService.getDocuments();
      setDocuments(docs);
      const isDownloaded = await embeddingService.isEmbeddingModelDownloaded();
      setHasEmbedModel(isDownloaded);
    } catch (err) {
      console.error('Error loading documents:', err);
    } finally {
      setIsLoadingDocs(false);
    }
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  // Subscribe to embedding model download state
  useEffect(() => {
    const unsub = subscribeDownload(EMBEDDING_MODEL.id, state => {
      setEmbedDownloadStatus(state.status);
      if (state.totalBytes > 0) {
        setEmbedDownloadPercent(
          Math.min(100, Math.round((state.bytesDownloaded / state.totalBytes) * 100))
        );
      }
      if (state.status === 'downloaded') {
        setHasEmbedModel(true);
      }
    });
    return unsub;
  }, []);

  const handlePickDocument = async () => {
    if (resourceState.mode === 'INDEXING') {
      Alert.alert('Busy', 'An indexing task is already running.');
      return;
    }

    try {
      const newDoc = await knowledgeService.pickAndIndexDocument();
      if (newDoc) {
        await loadDocs();
        Alert.alert(
          'Document Indexed',
          `"${newDoc.name}" was successfully chunked and added to your offline knowledge base.`
        );
      }
    } catch (err: any) {
      Alert.alert('Import Failed', err?.message || 'Could not index file.');
    }
  };

  const handleDeleteDocument = (doc: StoredDocument) => {
    Alert.alert(
      'Delete Document',
      `Are you sure you want to remove "${doc.name}" from your knowledge base?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await knowledgeService.deleteDocument(doc.id);
              await loadDocs();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to delete document.');
            }
          },
        },
      ]
    );
  };

  const handleDownloadEmbedModel = async () => {
    try {
      await startDownload(EMBEDDING_MODEL);
    } catch (err: any) {
      Alert.alert('Download Error', err?.message || 'Failed to start download.');
    }
  };

  const totalChunks = documents.reduce((acc, d) => acc + d.chunkCount, 0);
  const totalSizeBytes = documents.reduce((acc, d) => acc + d.size, 0);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[styles.backButton, { backgroundColor: theme.surface }]}
        >
          <Text style={[styles.backButtonText, { color: theme.textPrimary }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerTextCol}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>
            Knowledge Base
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Offline Hybrid RAG Search (BM25 + Vectors)
          </Text>
        </View>
      </View>

      {/* Live Indexing Progress Banner (ResourceGuard) */}
      {resourceState.mode === 'INDEXING' && resourceState.indexingProgress && (
        <View
          style={[
            styles.indexingBanner,
            { backgroundColor: theme.warningBg, borderColor: theme.warning + '50' },
          ]}
        >
          <View style={styles.indexingHeader}>
            <ActivityIndicator size="small" color={theme.warning} />
            <Text style={[styles.indexingTitle, { color: theme.warning }]}>
              {resourceState.activeTaskName || 'Indexing Document...'}
            </Text>
          </View>
          <Text style={[styles.indexingStatus, { color: theme.textPrimary }]}>
            {resourceState.indexingProgress.statusText}
          </Text>
          <View style={[styles.progressBarTrack, { backgroundColor: theme.cardBorder }]}>
            <View
              style={[
                styles.progressBarFill,
                {
                  backgroundColor: theme.warning,
                  width: `${resourceState.indexingProgress.percent}%`,
                },
              ]}
            />
          </View>
          <Text style={[styles.indexingGuardNote, { color: theme.textMuted }]}>
            🛡️ LLM Chat is paused to keep phone memory safe.
          </Text>
        </View>
      )}

      {/* Embedding Model Status Card */}
      <View
        style={[
          styles.embedCard,
          { backgroundColor: theme.card, borderColor: theme.cardBorder },
        ]}
      >
        <View style={styles.embedCardRow}>
          <View style={styles.embedIconWrap}>
            <Text style={styles.embedIcon}>{hasEmbedModel ? '⚡' : '🔍'}</Text>
          </View>
          <View style={styles.embedTextWrap}>
            <Text style={[styles.embedTitle, { color: theme.textPrimary }]}>
              {hasEmbedModel
                ? 'Semantic Vector Search: Active'
                : 'Lexical Search Only (BM25)'}
            </Text>
            <Text style={[styles.embedDesc, { color: theme.textSecondary }]}>
              {hasEmbedModel
                ? 'Hybrid mode combines exact keywords + concept embeddings.'
                : 'Download all-MiniLM-L6-v2 (~24 MB) for true concept matching.'}
            </Text>
          </View>
        </View>

        {!hasEmbedModel && (
          <TouchableOpacity
            onPress={handleDownloadEmbedModel}
            disabled={embedDownloadStatus === 'downloading'}
            style={[
              styles.downloadEmbedButton,
              { backgroundColor: theme.primary },
            ]}
          >
            <Text style={[styles.downloadEmbedButtonText, { color: theme.primaryForeground }]}>
              {embedDownloadStatus === 'downloading'
                ? `Downloading (${embedDownloadPercent}%)`
                : '⚡ Download MiniLM Embeddings (24 MB)'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Summary Metrics Card */}
      <View style={styles.metricsRow}>
        <View
          style={[
            styles.metricCard,
            { backgroundColor: theme.card, borderColor: theme.cardBorder },
          ]}
        >
          <Text style={[styles.metricNumber, { color: theme.primaryLight }]}>
            {documents.length}
          </Text>
          <Text style={[styles.metricLabel, { color: theme.textMuted }]}>
            Files Indexed
          </Text>
        </View>

        <View
          style={[
            styles.metricCard,
            { backgroundColor: theme.card, borderColor: theme.cardBorder },
          ]}
        >
          <Text style={[styles.metricNumber, { color: theme.success }]}>
            {totalChunks}
          </Text>
          <Text style={[styles.metricLabel, { color: theme.textMuted }]}>
            Text Chunks
          </Text>
        </View>

        <View
          style={[
            styles.metricCard,
            { backgroundColor: theme.card, borderColor: theme.cardBorder },
          ]}
        >
          <Text style={[styles.metricNumber, { color: theme.textPrimary }]}>
            {formatBytes(totalSizeBytes)}
          </Text>
          <Text style={[styles.metricLabel, { color: theme.textMuted }]}>
            Total Raw Text
          </Text>
        </View>
      </View>

      {/* Ingest Action Button */}
      <TouchableOpacity
        onPress={handlePickDocument}
        disabled={resourceState.mode === 'INDEXING'}
        style={[
          styles.importButton,
          {
            backgroundColor: theme.primary,
            opacity: resourceState.mode === 'INDEXING' ? 0.6 : 1,
          },
        ]}
      >
        <Text style={[styles.importButtonText, { color: theme.primaryForeground }]}>
          📄 Import Document (.txt, .md, .json)
        </Text>
      </TouchableOpacity>

      {/* Documents List */}
      <View style={styles.listSection}>
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
          Indexed Knowledge Files
        </Text>

        {isLoadingDocs ? (
          <ActivityIndicator style={{ marginTop: 30 }} color={theme.primaryLight} />
        ) : documents.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>📚</Text>
            <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
              No Documents Indexed Yet
            </Text>
            <Text style={[styles.emptyDesc, { color: theme.textMuted }]}>
              Import text notes, study guides, articles, or offline Wikipedia
              excerpts to search and cite them directly in offline chat.
            </Text>
          </View>
        ) : (
          <FlatList
            data={documents}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingBottom: 24 }}
            renderItem={({ item }) => (
              <View
                style={[
                  styles.docCard,
                  { backgroundColor: theme.card, borderColor: theme.cardBorder },
                ]}
              >
                <View style={styles.docCardInfo}>
                  <Text style={[styles.docName, { color: theme.textPrimary }]}>
                    📄 {item.name}
                  </Text>
                  <Text style={[styles.docMeta, { color: theme.textMuted }]}>
                    {item.chunkCount} chunks • {formatBytes(item.size)} •{' '}
                    {new Date(item.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleDeleteDocument(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={[styles.deleteBtn, { backgroundColor: theme.badgeBg }]}
                >
                  <Text style={[styles.deleteBtnText, { color: theme.error }]}>
                    🗑️
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.md,
    gap: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 20,
    fontWeight: '700',
  },
  headerTextCol: {
    flex: 1,
  },
  title: {
    ...typography.titleLarge,
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    ...typography.caption,
    fontSize: 12,
    marginTop: 2,
  },
  indexingBanner: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
    gap: 8,
  },
  indexingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  indexingTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  indexingStatus: {
    fontSize: 12,
    fontWeight: '500',
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  indexingGuardNote: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  embedCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  embedCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  embedIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  embedIcon: {
    fontSize: 20,
  },
  embedTextWrap: {
    flex: 1,
  },
  embedTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  embedDesc: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  downloadEmbedButton: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  downloadEmbedButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: spacing.md,
  },
  metricCard: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
  },
  metricNumber: {
    fontSize: 18,
    fontWeight: '800',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  importButton: {
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  importButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  listSection: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 8,
  },
  docCardInfo: {
    flex: 1,
    marginRight: 10,
  },
  docName: {
    fontSize: 14,
    fontWeight: '600',
  },
  docMeta: {
    fontSize: 11,
    marginTop: 4,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {
    fontSize: 14,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
