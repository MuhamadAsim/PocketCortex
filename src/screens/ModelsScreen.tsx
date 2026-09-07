import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
} from 'react-native';
import { MODEL_CATALOG, formatBytes } from '../constants/modelCatalog';
import { ModelDefinition, ModelDownloadState } from '../types/models';
import {
  startDownload,
  pauseDownload,
  resumeDownload,
  deleteModel,
  subscribeDownload,
  syncDiskState,
  getDownloadState,
} from '../services/downloadManager';
import {
  setSelectedModelId,
  getSelectedModelId,
} from '../storage/modelStorage';
import { useLlama } from '../hooks/useLlama';
import { ModelCard } from '../components/ModelCard';
import { useTheme } from '../theme/ThemeContext';
import { spacing, radius, typography } from '../theme/theme';

import { ModelsScreenNavigationProps } from '../navigation/types';

export interface ModelsScreenProps {
  navigation?: ModelsScreenNavigationProps['navigation'];
  route?: ModelsScreenNavigationProps['route'];
  onOpenChat?: (modelId: string) => void;
}

export const ModelsScreen: React.FC<ModelsScreenProps> = ({
  navigation,
  onOpenChat,
}) => {
  const { theme, isDark, themePreference, setThemePreference, toggleTheme } =
    useTheme();

  const [downloadStates, setDownloadStates] = useState<
    Record<string, ModelDownloadState>
  >(() => {
    const initial: Record<string, ModelDownloadState> = {};
    MODEL_CATALOG.forEach(m => {
      initial[m.id] = getDownloadState(m.id);
    });
    return initial;
  });

  const [refreshing, setRefreshing] = useState(false);
  const [loadingRAMModelId, setLoadingRAMModelId] = useState<string | null>(null);

  const {
    activeModelId,
    isLoading: isLlamaLoading,
    loadProgress,
    loadModel,
    unloadModel,
  } = useLlama();

  // Subscribe to real-time download updates for all models
  useEffect(() => {
    const unsubscribes: Array<() => void> = [];

    MODEL_CATALOG.forEach(model => {
      const unsub = subscribeDownload(model.id, newState => {
        setDownloadStates(prev => ({
          ...prev,
          [model.id]: newState,
        }));
      });
      unsubscribes.push(unsub);
    });

    // Run initial disk synchronization
    handleRefresh();

    return () => {
      unsubscribes.forEach(u => u());
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const results = await Promise.all(
        MODEL_CATALOG.map(model => syncDiskState(model))
      );
      const updated: Record<string, ModelDownloadState> = {};
      results.forEach(s => {
        updated[s.modelId] = s;
      });
      setDownloadStates(prev => ({ ...prev, ...updated }));
    } catch (err) {
      console.warn('Failed to sync disk states:', err);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Compute total on-device storage used
  const totalDiskBytesUsed = useMemo(() => {
    return Object.values(downloadStates).reduce((acc, state) => {
      if (state.status === 'downloaded') {
        return acc + state.bytesDownloaded;
      }
      return acc;
    }, 0);
  }, [downloadStates]);

  const downloadedCount = useMemo(() => {
    return Object.values(downloadStates).filter(
      s => s.status === 'downloaded'
    ).length;
  }, [downloadStates]);

  // Action Handlers
  const handleDownload = useCallback(async (model: ModelDefinition) => {
    try {
      await startDownload(model);
    } catch (err: any) {
      Alert.alert('Download Error', err?.message || 'Failed to start download.');
    }
  }, []);

  const handlePause = useCallback(async (modelId: string) => {
    try {
      await pauseDownload(modelId);
    } catch (err: any) {
      Alert.alert('Pause Error', err?.message || 'Failed to pause download.');
    }
  }, []);

  const handleResume = useCallback(async (model: ModelDefinition) => {
    try {
      await resumeDownload(model);
    } catch (err: any) {
      Alert.alert('Resume Error', err?.message || 'Failed to resume download.');
    }
  }, []);

  const handleDelete = useCallback(
    async (modelId: string) => {
      try {
        if (activeModelId === modelId) {
          await unloadModel();
        }
        await deleteModel(modelId);
      } catch (err: any) {
        Alert.alert('Delete Error', err?.message || 'Failed to delete model.');
      }
    },
    [activeModelId, unloadModel]
  );

  const handleSelectModel = useCallback(
    async (model: ModelDefinition) => {
      setSelectedModelId(model.id);

      const goToChat = () => {
        if (navigation) {
          navigation.navigate('Chat', { modelId: model.id });
        } else if (onOpenChat) {
          onOpenChat(model.id);
        } else {
          Alert.alert(
            'Model Ready',
            `${model.name} is ready for chat!`
          );
        }
      };

      // If already loaded in RAM, jump straight to chat
      if (activeModelId === model.id) {
        goToChat();
        return;
      }

      // Preload model into RAM
      setLoadingRAMModelId(model.id);
      try {
        await loadModel(model.id);
        setLoadingRAMModelId(null);
        goToChat();
      } catch (err: any) {
        setLoadingRAMModelId(null);
        Alert.alert('Load Error', err?.message || 'Failed to load model into RAM.');
      }
    },
    [activeModelId, loadModel, navigation, onOpenChat]
  );

  const handleUnloadRAM = useCallback(async () => {
    try {
      await unloadModel();
    } catch (err: any) {
      Alert.alert('Unload Error', err?.message || 'Failed to unload model.');
    }
  }, [unloadModel]);

  const activeModel = useMemo(() => {
    if (!activeModelId) return null;
    return MODEL_CATALOG.find(m => m.id === activeModelId);
  }, [activeModelId]);

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Top App Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: theme.surface, borderBottomColor: theme.divider },
        ]}
      >
        <View style={styles.headerLeft}>
          <View style={styles.brandRow}>
            <Text style={[styles.brandTitle, { color: theme.textPrimary }]}>
              PocketLLM
            </Text>
            <View
              style={[
                styles.offlineBadge,
                { backgroundColor: theme.successBg, borderColor: theme.success },
              ]}
            >
              <Text style={[styles.offlineBadgeText, { color: theme.success }]}>
                ● OFFLINE
              </Text>
            </View>
          </View>
          <Text style={[styles.brandSubtitle, { color: theme.textSecondary }]}>
            On-Device Local AI • Private & Fast
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.themeButton,
            { backgroundColor: theme.badgeBg, borderColor: theme.badgeBorder },
          ]}
          activeOpacity={0.7}
          onPress={toggleTheme}
        >
          <Text style={[styles.themeButtonText, { color: theme.textPrimary }]}>
            {isDark ? '🌙 Dark' : '☀️ Light'}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={MODEL_CATALOG}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
        ListHeaderComponent={
          <View style={styles.listHeaderContainer}>
            {/* Storage Metric Card */}
            <View
              style={[
                styles.metricCard,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
              ]}
            >
              <View style={styles.metricRow}>
                <View style={styles.metricItem}>
                  <Text
                    style={[styles.metricLabel, { color: theme.textMuted }]}
                  >
                    MODELS DOWNLOADED
                  </Text>
                  <Text
                    style={[styles.metricValue, { color: theme.textPrimary }]}
                  >
                    {downloadedCount} / {MODEL_CATALOG.length}
                  </Text>
                </View>

                <View
                  style={[
                    styles.metricDivider,
                    { backgroundColor: theme.divider },
                  ]}
                />

                <View style={styles.metricItem}>
                  <Text
                    style={[styles.metricLabel, { color: theme.textMuted }]}
                  >
                    STORAGE USED
                  </Text>
                  <Text
                    style={[styles.metricValue, { color: theme.primaryLight }]}
                  >
                    {formatBytes(totalDiskBytesUsed)}
                  </Text>
                </View>
              </View>
            </View>

            {/* RAM Status Banner (if a model is loaded or loading) */}
            {(activeModel || isLlamaLoading) && (
              <View
                style={[
                  styles.ramCard,
                  {
                    backgroundColor: theme.primaryLight + '15',
                    borderColor: theme.primaryLight,
                  },
                ]}
              >
                <View style={styles.ramInfo}>
                  <Text style={[styles.ramTitle, { color: theme.primaryLight }]}>
                    {isLlamaLoading
                      ? `Loading into RAM... (${loadProgress}%)`
                      : `Active in RAM: ${activeModel?.name}`}
                  </Text>
                  <Text
                    style={[styles.ramSubtitle, { color: theme.textSecondary }]}
                  >
                    Zero-latency inference ready.
                  </Text>
                </View>

                {activeModel && !isLlamaLoading && (
                  <TouchableOpacity
                    style={[
                      styles.unloadButton,
                      { backgroundColor: theme.buttonSecondaryBg },
                    ]}
                    activeOpacity={0.8}
                    onPress={handleUnloadRAM}
                  >
                    <Text
                      style={[
                        styles.unloadButtonText,
                        { color: theme.buttonSecondaryText },
                      ]}
                    >
                      Unload
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <Text
              style={[styles.sectionHeading, { color: theme.textSecondary }]}
            >
              AVAILABLE MODELS ({MODEL_CATALOG.length})
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const state = downloadStates[item.id] || {
            modelId: item.id,
            status: 'not_downloaded',
            bytesDownloaded: 0,
            totalBytes: item.sizeBytes,
            updatedAt: 0,
          };

          const isLoadedInRAM = activeModelId === item.id;
          const isLoadingRAM = loadingRAMModelId === item.id || (isLlamaLoading && activeModelId === item.id);

          return (
            <ModelCard
              model={item}
              downloadState={state}
              isLoadedInRAM={isLoadedInRAM}
              isLoadingRAM={isLoadingRAM}
              onDownload={handleDownload}
              onPause={handlePause}
              onResume={handleResume}
              onDelete={handleDelete}
              onSelectModel={handleSelectModel}
            />
          );
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flex: 1,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  brandTitle: {
    ...typography.titleLarge,
  },
  offlineBadge: {
    paddingHorizontal: spacing.sm - 2,
    paddingVertical: 2,
    borderRadius: radius.xs,
    borderWidth: 1,
  },
  offlineBadgeText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '700',
  },
  brandSubtitle: {
    ...typography.bodySmall,
    marginTop: 2,
  },
  themeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  themeButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  listHeaderContainer: {
    marginBottom: spacing.md,
  },
  metricCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  metricItem: {
    alignItems: 'center',
    flex: 1,
  },
  metricLabel: {
    ...typography.caption,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  metricDivider: {
    width: 1,
    height: 32,
  },
  ramCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  ramInfo: {
    flex: 1,
  },
  ramTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  ramSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  unloadButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
    marginLeft: spacing.md,
  },
  unloadButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sectionHeading: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    letterSpacing: 0.5,
  },
});
