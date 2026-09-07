import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ToastAndroid, Platform } from 'react-native';
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
  const [copied, setCopied] = useState(false);

  // Strictly distinguish user vs assistant vs system
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  const formattedTime = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleCopy = useCallback(() => {
    if (onCopy) {
      onCopy(message.content);
    }
    setCopied(true);
    if (Platform.OS === 'android') {
      ToastAndroid.show('Message copied to clipboard', ToastAndroid.SHORT);
    }
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  }, [message.content, onCopy]);

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
            ℹ️ {message.content}
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
      {/* Assistant Avatar on Left */}
      {!isUser && (
        <View
          style={[
            styles.avatarCircle,
            { backgroundColor: theme.primaryLight + '20', borderColor: theme.primaryLight + '40' },
          ]}
        >
          <Text style={styles.avatarEmoji}>🤖</Text>
        </View>
      )}

      {/* Bubble Container */}
      <View
        style={[
          styles.bubbleWrapper,
          isUser ? styles.bubbleWrapperUser : styles.bubbleWrapperAssistant,
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.92}
          onLongPress={handleCopy}
          style={[
            styles.bubble,
            isUser
              ? [
                  styles.bubbleUser,
                  {
                    backgroundColor: theme.primary,
                    borderColor: theme.primaryDark,
                  },
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
                  styles.modelBadge,
                  {
                    backgroundColor: theme.badgeBg,
                    borderColor: theme.badgeBorder,
                  },
                ]}
              >
                <Text style={[styles.modelBadgeText, { color: theme.primaryLight }]}>
                  {modelName || 'Local AI'}
                </Text>
              </View>
              {isStreaming && (
                <View
                  style={[
                    styles.liveIndicator,
                    { backgroundColor: theme.warningBg },
                  ]}
                >
                  <Text style={[styles.liveIndicatorText, { color: theme.warning }]}>
                    ● generating
                  </Text>
                </View>
              )}
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

          {/* Footer with Timestamp and Copy action */}
          <View style={styles.footerRow}>
            <Text
              style={[
                styles.timeText,
                {
                  color: isUser
                    ? 'rgba(255, 255, 255, 0.75)'
                    : theme.textMuted,
                },
              ]}
            >
              {formattedTime}
            </Text>

            {!isUser && message.content.length > 0 && !isStreaming && (
              <TouchableOpacity
                onPress={handleCopy}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.copyButton}
              >
                <Text
                  style={[
                    styles.copyButtonText,
                    { color: copied ? theme.success : theme.textMuted },
                  ]}
                >
                  {copied ? '✓ Copied' : '📋 Copy'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    marginVertical: 6,
    flexDirection: 'row',
    alignItems: 'flex-end',
    width: '100%',
  },
  rowUser: {
    justifyContent: 'flex-end',
    paddingLeft: 44,
  },
  rowAssistant: {
    justifyContent: 'flex-start',
    paddingRight: 32,
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 2,
  },
  avatarEmoji: {
    fontSize: 16,
  },
  bubbleWrapper: {
    maxWidth: '84%',
  },
  bubbleWrapperUser: {
    alignItems: 'flex-end',
  },
  bubbleWrapperAssistant: {
    alignItems: 'flex-start',
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleUser: {
    borderBottomRightRadius: 3,
    borderTopRightRadius: radius.lg,
    borderTopLeftRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
  },
  bubbleAssistant: {
    borderBottomLeftRadius: 3,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  assistantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 8,
  },
  modelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.xs,
    borderWidth: 1,
  },
  modelBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  liveIndicator: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.xs,
  },
  liveIndicatorText: {
    fontSize: 10,
    fontWeight: '600',
  },
  messageText: {
    ...typography.bodyLarge,
    fontSize: 15,
    lineHeight: 22,
  },
  cursor: {
    fontWeight: '900',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 6,
    gap: 10,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  copyButton: {
    paddingVertical: 1,
    paddingHorizontal: 4,
  },
  copyButtonText: {
    fontSize: 11,
    fontWeight: '600',
  },
  systemContainer: {
    alignItems: 'center',
    marginVertical: spacing.sm,
    width: '100%',
  },
  systemPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  systemText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
