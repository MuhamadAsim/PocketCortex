import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ChatMessage } from '../types/models';
import { useTheme } from '../theme/ThemeContext';
import { spacing, radius, typography } from '../theme/theme';

export interface ChatBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  modelName?: string;
  onCopy?: (text: string) => void;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({
  message,
  isStreaming = false,
  modelName,
  onCopy,
}) => {
  const { theme } = useTheme();
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  const formattedTime = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isSystem) {
    return (
      <View style={styles.systemContainer}>
        <View
          style={[
            styles.systemPill,
            { backgroundColor: theme.badgeBg, borderColor: theme.badgeBorder },
          ]}
        >
          <Text style={[styles.systemText, { color: theme.textMuted }]}>
            {message.content}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.row,
        isUser ? styles.rowUser : styles.rowAssistant,
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onLongPress={() => onCopy && onCopy(message.content)}
        style={[
          styles.bubble,
          isUser
            ? [
                styles.bubbleUser,
                { backgroundColor: theme.primary },
              ]
            : [
                styles.bubbleAssistant,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                },
              ],
        ]}
      >
        {/* Assistant Header Tag */}
        {!isUser && (
          <View style={styles.assistantHeader}>
            <View
              style={[
                styles.avatarTag,
                { backgroundColor: theme.primaryLight + '20' },
              ]}
            >
              <Text style={[styles.avatarTagText, { color: theme.primaryLight }]}>
                ⚡ {modelName || 'Local LLM'}
              </Text>
            </View>
          </View>
        )}

        {/* Message Content */}
        <Text
          style={[
            styles.messageText,
            {
              color: isUser ? theme.primaryForeground : theme.textPrimary,
            },
          ]}
          selectable
        >
          {message.content}
          {isStreaming && (
            <Text style={[styles.cursor, { color: theme.primaryLight }]}>
              {' ▋'}
            </Text>
          )}
        </Text>

        {/* Timestamp */}
        <View style={styles.footerRow}>
          <Text
            style={[
              styles.timeText,
              {
                color: isUser
                  ? 'rgba(255, 255, 255, 0.7)'
                  : theme.textMuted,
              },
            ]}
          >
            {formattedTime}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    marginVertical: spacing.xs + 2,
    flexDirection: 'row',
  },
  rowUser: {
    justifyContent: 'flex-end',
    paddingLeft: 48,
  },
  rowAssistant: {
    justifyContent: 'flex-start',
    paddingRight: 48,
  },
  bubble: {
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.md - 2,
    maxWidth: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  bubbleUser: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.xs,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  bubbleAssistant: {
    borderTopLeftRadius: radius.xs,
    borderTopRightRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    borderWidth: 1,
  },
  assistantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  avatarTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  avatarTagText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  messageText: {
    ...typography.bodyLarge,
    fontSize: 14.5,
    lineHeight: 21,
  },
  cursor: {
    fontWeight: '900',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  timeText: {
    fontSize: 10,
    fontWeight: '500',
  },
  systemContainer: {
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  systemPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  systemText: {
    fontSize: 11,
    fontWeight: '500',
  },
});
