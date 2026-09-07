import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { getModelById } from '../constants/modelCatalog';
import { ChatMessage } from '../types/models';
import {
  getChatMessages,
  saveChatMessages,
  appendChatMessage,
  updateLastChatMessage,
  clearChatMessages,
} from '../storage/chatStorage';
import { useLlama } from '../hooks/useLlama';
import { ChatBubble } from '../components/ChatBubble';
import { useTheme } from '../theme/ThemeContext';
import { spacing, radius, typography } from '../theme/theme';

import { ChatScreenNavigationProps } from '../navigation/types';

export interface ChatScreenProps {
  navigation?: ChatScreenNavigationProps['navigation'];
  route?: ChatScreenNavigationProps['route'];
  modelId?: string;
  onBack?: () => void;
}

const STARTER_PROMPTS = [
  'Explain how on-device AI inference works.',
  'Write a TypeScript function to debounce an event.',
  'Give me 3 creative sci-fi story ideas.',
  'Summarize the key benefits of local LLMs.',
];

export const ChatScreen: React.FC<ChatScreenProps> = ({
  navigation,
  route,
  modelId: propModelId,
  onBack: propOnBack,
}) => {
  const modelId = route?.params?.modelId || propModelId || '';
  const handleBack = useCallback(() => {
    if (navigation) {
      navigation.goBack();
    } else if (propOnBack) {
      propOnBack();
    }
  }, [navigation, propOnBack]);

  const { theme, isDark } = useTheme();
  const model = getModelById(modelId);

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    getChatMessages(modelId)
  );
  const [inputText, setInputText] = useState('');
  const [streamingContent, setStreamingContent] = useState('');
  const [activeAssistantMsgId, setActiveAssistantMsgId] = useState<string | null>(
    null
  );

  const flatListRef = useRef<FlatList>(null);

  const {
    activeModelId,
    isLoading: isModelLoading,
    loadProgress,
    isGenerating,
    loadModel,
    generateCompletion,
    stopGeneration,
  } = useLlama();

  // Load model into RAM on mount if not already active
  useEffect(() => {
    if (activeModelId !== modelId && !isModelLoading) {
      loadModel(modelId).catch(err => {
        Alert.alert('Model Loading Failed', err?.message || 'Could not load model.');
      });
    }
  }, [modelId, activeModelId, isModelLoading, loadModel]);

  // Scroll to bottom helper
  const scrollToBottom = useCallback((animated = true) => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated });
    }, 100);
  }, []);

  const handleClearChat = useCallback(() => {
    Alert.alert(
      'Clear Conversation',
      'Are you sure you want to clear all messages for this model? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => {
            clearChatMessages(modelId);
            setMessages([]);
            setStreamingContent('');
            setActiveAssistantMsgId(null);
          },
        },
      ]
    );
  }, [modelId]);

  const handleSend = useCallback(
    async (textToSend?: string) => {
      const content = (textToSend || inputText).trim();
      if (!content || isGenerating) return;

      setInputText('');

      // Create and persist user message
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content,
        timestamp: Date.now(),
      };

      const updatedWithUser = appendChatMessage(modelId, userMsg);
      setMessages(updatedWithUser);
      scrollToBottom();

      // Placeholder assistant message
      const assistantId = `assistant-${Date.now()}`;
      const placeholderAssistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };

      const withPlaceholder = [...updatedWithUser, placeholderAssistantMsg];
      setMessages(withPlaceholder);
      setActiveAssistantMsgId(assistantId);
      setStreamingContent('');
      scrollToBottom();

      let accumulated = '';

      try {
        await generateCompletion({
          modelId,
          messages: updatedWithUser,
          onToken: (token: string) => {
            accumulated += token;
            setStreamingContent(accumulated);
            setMessages(prev => {
              const copy = [...prev];
              const targetIndex = copy.findIndex(m => m.id === assistantId);
              if (targetIndex !== -1) {
                copy[targetIndex] = {
                  ...copy[targetIndex],
                  content: accumulated,
                };
              }
              return copy;
            });
            scrollToBottom(false);
          },
        });

        // Persist completed response to MMKV
        updateLastChatMessage(modelId, accumulated);
      } catch (err: any) {
        if (!accumulated) {
          setMessages(prev =>
            prev.filter(m => m.id !== assistantId)
          );
          Alert.alert('Inference Error', err?.message || 'Failed to generate response.');
        } else {
          updateLastChatMessage(modelId, accumulated);
        }
      } finally {
        setActiveAssistantMsgId(null);
        setStreamingContent('');
        scrollToBottom();
      }
    },
    [
      inputText,
      isGenerating,
      modelId,
      generateCompletion,
      scrollToBottom,
    ]
  );

  const handleStop = useCallback(async () => {
    try {
      await stopGeneration();
      if (activeAssistantMsgId && streamingContent) {
        updateLastChatMessage(modelId, streamingContent);
      }
    } catch (err) {
      console.warn('Failed to stop generation:', err);
    } finally {
      setActiveAssistantMsgId(null);
      setStreamingContent('');
    }
  }, [stopGeneration, activeAssistantMsgId, streamingContent, modelId]);

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Screen Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.surface,
            borderBottomColor: theme.divider,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.7}
          onPress={handleBack}
        >
          <Text style={[styles.backButtonText, { color: theme.primary }]}>
            ‹ Back
          </Text>
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <Text
            style={[styles.modelTitle, { color: theme.textPrimary }]}
            numberOfLines={1}
          >
            {model?.name || 'Local Chat'}
          </Text>
          <View style={styles.statusRow}>
            {isModelLoading ? (
              <Text style={[styles.statusText, { color: theme.warning }]}>
                Loading context {loadProgress}%...
              </Text>
            ) : isGenerating ? (
              <Text style={[styles.statusText, { color: theme.primaryLight }]}>
                ● Thinking...
              </Text>
            ) : (
              <Text style={[styles.statusText, { color: theme.success }]}>
                ● Offline Ready ({model?.quantLabel})
              </Text>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={styles.clearButton}
          activeOpacity={0.7}
          onPress={handleClearChat}
        >
          <Text style={[styles.clearButtonText, { color: theme.error }]}>
            Clear
          </Text>
        </TouchableOpacity>
      </View>

      {/* Keyboard Avoiding Container */}
      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Messages List or Starter Screen */}
        {messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View
              style={[
                styles.emptyIconCircle,
                { backgroundColor: theme.primaryLight + '15' },
              ]}
            >
              <Text style={styles.emptyIconText}>⚡</Text>
            </View>
            <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
              {model?.name}
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              Running 100% locally on your device.{'\n'}No data leaves this phone.
            </Text>

            <View style={styles.promptSuggestions}>
              <Text
                style={[
                  styles.suggestionHeader,
                  { color: theme.textMuted },
                ]}
              >
                TRY ASKING:
              </Text>
              {STARTER_PROMPTS.map((prompt, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.promptCard,
                    {
                      backgroundColor: theme.card,
                      borderColor: theme.cardBorder,
                    },
                  ]}
                  activeOpacity={0.7}
                  onPress={() => handleSend(prompt)}
                >
                  <Text
                    style={[styles.promptText, { color: theme.textPrimary }]}
                  >
                    "{prompt}"
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() => scrollToBottom(false)}
            renderItem={({ item }) => {
              const isStreamingThis = item.id === activeAssistantMsgId;
              return (
                <ChatBubble
                  message={item}
                  isStreaming={isStreamingThis}
                  modelName={model?.name}
                />
              );
            }}
          />
        )}

        {/* Input Bar */}
        <View
          style={[
            styles.inputContainer,
            {
              backgroundColor: theme.surface,
              borderTopColor: theme.divider,
            },
          ]}
        >
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: theme.badgeBg,
                color: theme.textPrimary,
                borderColor: theme.badgeBorder,
              },
            ]}
            placeholder={
              isModelLoading
                ? 'Loading model into memory...'
                : 'Type a message...'
            }
            placeholderTextColor={theme.textMuted}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={2000}
            editable={!isModelLoading}
          />

          {isGenerating ? (
            <TouchableOpacity
              style={[
                styles.actionButton,
                { backgroundColor: theme.buttonDangerBg },
              ]}
              activeOpacity={0.8}
              onPress={handleStop}
            >
              <Text
                style={[
                  styles.actionButtonText,
                  { color: theme.buttonDangerText },
                ]}
              >
                ■ Stop
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.actionButton,
                {
                  backgroundColor:
                    inputText.trim().length > 0 && !isModelLoading
                      ? theme.primary
                      : theme.badgeBorder,
                },
              ]}
              activeOpacity={0.8}
              disabled={inputText.trim().length === 0 || isModelLoading}
              onPress={() => handleSend()}
            >
              <Text
                style={[
                  styles.actionButtonText,
                  { color: theme.primaryForeground },
                ]}
              >
                ▲ Send
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flexOne: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderBottomWidth: 1,
  },
  backButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: spacing.sm,
  },
  modelTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  clearButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  clearButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  messageList: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyIconText: {
    fontSize: 28,
  },
  emptyTitle: {
    ...typography.titleMedium,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...typography.bodyMedium,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  promptSuggestions: {
    width: '100%',
    gap: spacing.sm,
  },
  suggestionHeader: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  promptCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  promptText: {
    fontSize: 13,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    gap: spacing.sm,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    fontSize: 14,
  },
  actionButton: {
    height: 40,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
