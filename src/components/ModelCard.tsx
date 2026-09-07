import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { ModelDefinition, ModelDownloadState } from '../types/models';
import { formatBytes } from '../constants/modelCatalog';
import { useTheme } from '../theme/ThemeContext';
import { spacing, radius, typography } from '../theme/theme';

export interface ModelCardProps {
  model: ModelDefinition;
  downloadState: ModelDownloadState;
  isLoadedInRAM: boolean;
  isLoadingRAM?: boolean;
  onDownload: (model: ModelDefinition) => void;
  onPause: (modelId: string) => void;
  onResume: (model: ModelDefinition) => void;
  onDelete: (modelId: string) => void;
  onSelectModel: (model: ModelDefinition) => void;
}

export const ModelCard: React.FC<ModelCardProps> = ({
  model,
  downloadState,
  isLoadedInRAM,
  isLoadingRAM,
  onDownload,
  onPause,
  onResume,
  onDelete,
  onSelectModel,
}) => {
  const { theme } = useTheme();

  const total = downloadState.totalBytes > 0 ? downloadState.totalBytes : model.sizeBytes;
  const downloaded = downloadState.bytesDownloaded;
  const progress = total > 0 ? Math.min(1, Math.max(0, downloaded / total)) : 0;
  const progressPercent = Math.round(progress * 100);

  const confirmDelete = () => {
    Alert.alert(
      'Delete Model File',
      `Are you sure you want to delete ${model.name}? You will need to re-download it to use offline inference.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete(model.id),
        },
      ]
    );
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: isLoadedInRAM ? theme.primary : theme.cardBorder,
        },
      ]}
    >
      {/* Header with Title & Badges */}
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={[styles.modelName, { color: theme.textPrimary }]}>
            {model.name}
          </Text>
          <View style={styles.badgeRow}>
            <View
              style={[
                styles.badge,
                { backgroundColor: theme.badgeBg, borderColor: theme.badgeBorder },
              ]}
            >
              <Text style={[styles.badgeText, { color: theme.primaryLight }]}>
                {model.parameters}
              </Text>
            </View>
            <View
              style={[
                styles.badge,
                { backgroundColor: theme.badgeBg, borderColor: theme.badgeBorder },
              ]}
            >
              <Text style={[styles.badgeText, { color: theme.textSecondary }]}>
                {model.quantLabel}
              </Text>
            </View>
            <View
              style={[
                styles.badge,
                { backgroundColor: theme.badgeBg, borderColor: theme.badgeBorder },
              ]}
            >
              <Text style={[styles.badgeText, { color: theme.textSecondary }]}>
                {formatBytes(model.sizeBytes)}
              </Text>
            </View>
            {isLoadedInRAM && (
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: theme.primaryLight + '25',
                    borderColor: theme.primaryLight,
                  },
                ]}
              >
                <Text style={[styles.badgeText, { color: theme.primaryLight, fontWeight: '700' }]}>
                  ⚡ IN RAM
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Description */}
      <Text style={[styles.description, { color: theme.textSecondary }]}>
        {model.description}
      </Text>

      {/* Dynamic Action Section */}
      <View style={styles.actionContainer}>
        {downloadState.status === 'not_downloaded' && (
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
            activeOpacity={0.8}
            onPress={() => onDownload(model)}
          >
            <Text style={[styles.primaryButtonText, { color: theme.primaryForeground }]}>
              Download Model ({formatBytes(model.sizeBytes)})
            </Text>
          </TouchableOpacity>
        )}

        {downloadState.status === 'downloading' && (
          <View style={styles.progressContainer}>
            <View style={styles.progressStats}>
              <Text style={[styles.progressText, { color: theme.textPrimary }]}>
                Downloading... {progressPercent}%
              </Text>
              <Text style={[styles.bytesText, { color: theme.textMuted }]}>
                {formatBytes(downloaded)} / {formatBytes(total)}
              </Text>
            </View>

            {/* Progress Track */}
            <View style={[styles.progressBarTrack, { backgroundColor: theme.progressBg }]}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    backgroundColor: theme.progressFill,
                    width: `${Math.max(2, progressPercent)}%`,
                  },
                ]}
              />
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[
                  styles.secondaryButton,
                  { backgroundColor: theme.buttonSecondaryBg },
                ]}
                activeOpacity={0.8}
                onPress={() => onPause(model.id)}
              >
                <Text
                  style={[
                    styles.secondaryButtonText,
                    { color: theme.buttonSecondaryText },
                  ]}
                >
                  Pause
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.dangerButton,
                  { backgroundColor: theme.buttonDangerBg },
                ]}
                activeOpacity={0.8}
                onPress={confirmDelete}
              >
                <Text
                  style={[
                    styles.dangerButtonText,
                    { color: theme.buttonDangerText },
                  ]}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {downloadState.status === 'paused' && (
          <View style={styles.progressContainer}>
            <View style={styles.progressStats}>
              <Text style={[styles.progressText, { color: theme.warning }]}>
                Paused at {progressPercent}%
              </Text>
              <Text style={[styles.bytesText, { color: theme.textMuted }]}>
                {formatBytes(downloaded)} / {formatBytes(total)}
              </Text>
            </View>

            {/* Progress Track in warning color */}
            <View style={[styles.progressBarTrack, { backgroundColor: theme.progressBg }]}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    backgroundColor: theme.warning,
                    width: `${Math.max(2, progressPercent)}%`,
                  },
                ]}
              />
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.primaryButtonSmall, { backgroundColor: theme.primary }]}
                activeOpacity={0.8}
                onPress={() => onResume(model)}
              >
                <Text
                  style={[
                    styles.primaryButtonText,
                    { color: theme.primaryForeground },
                  ]}
                >
                  Resume Download
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.dangerButton,
                  { backgroundColor: theme.buttonDangerBg },
                ]}
                activeOpacity={0.8}
                onPress={confirmDelete}
              >
                <Text
                  style={[
                    styles.dangerButtonText,
                    { color: theme.buttonDangerText },
                  ]}
                >
                  Delete
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {downloadState.status === 'downloaded' && (
          <View style={styles.downloadedContainer}>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: theme.success }]} />
              <Text style={[styles.statusLabel, { color: theme.success }]}>
                Downloaded & Ready for Offline Use
              </Text>
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.chatButton, { backgroundColor: theme.primary }]}
                activeOpacity={0.8}
                onPress={() => onSelectModel(model)}
              >
                {isLoadingRAM ? (
                  <ActivityIndicator color={theme.primaryForeground} size="small" />
                ) : (
                  <Text
                    style={[
                      styles.chatButtonText,
                      { color: theme.primaryForeground },
                    ]}
                  >
                    Chat Now
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.deleteIconButton,
                  { backgroundColor: theme.buttonDangerBg },
                ]}
                activeOpacity={0.8}
                onPress={confirmDelete}
              >
                <Text
                  style={[
                    styles.deleteIconButtonText,
                    { color: theme.buttonDangerText },
                  ]}
                >
                  Delete
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {downloadState.status === 'error' && (
          <View style={styles.errorContainer}>
            <Text style={[styles.errorText, { color: theme.error }]}>
              {downloadState.error || 'Download failed. Check your connection.'}
            </Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.primaryButtonSmall, { backgroundColor: theme.primary }]}
                activeOpacity={0.8}
                onPress={() => onResume(model)}
              >
                <Text
                  style={[
                    styles.primaryButtonText,
                    { color: theme.primaryForeground },
                  ]}
                >
                  Retry Download
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.dangerButton,
                  { backgroundColor: theme.buttonDangerBg },
                ]}
                activeOpacity={0.8}
                onPress={confirmDelete}
              >
                <Text
                  style={[
                    styles.dangerButtonText,
                    { color: theme.buttonDangerText },
                  ]}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    marginBottom: spacing.sm,
  },
  titleContainer: {
    flexDirection: 'column',
    gap: spacing.xs,
  },
  modelName: {
    ...typography.titleMedium,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.xs,
    borderWidth: 1,
  },
  badgeText: {
    ...typography.caption,
  },
  description: {
    ...typography.bodyMedium,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  actionContainer: {
    marginTop: spacing.xs,
  },
  primaryButton: {
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonSmall: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  progressContainer: {
    gap: spacing.sm,
  },
  progressStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 13,
    fontWeight: '600',
  },
  bytesText: {
    fontSize: 12,
  },
  progressBarTrack: {
    height: 8,
    borderRadius: radius.full,
    overflow: 'hidden',
    width: '100%',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  dangerButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  downloadedContainer: {
    gap: spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  chatButton: {
    flex: 1,
    paddingVertical: spacing.md - 2,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  deleteIconButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md - 2,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteIconButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  errorContainer: {
    gap: spacing.sm,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
