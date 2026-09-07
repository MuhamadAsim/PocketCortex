import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getModelById } from '../constants/modelCatalog';
import { ChatMessage } from '../types/models';
import {
  getChatMessages,
  saveChatMessages,
  appendChatMessage,
  updateChatMessageContent,
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
  const insets = useSafeAreaInsets();
  const modelId = route?.params?.modelId || propModelId || '';
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
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

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

  const handleBack = useCallback(() => {
    if (navigation) {
      navigation.goBack();
    } else if (propOnBack) {
      propOnBack();
    }
  }, [navigation, propOnBack]);

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

  // Keyboard show/hide listener to adjust bottom clearance smoothly on Android
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setIsKeyboardVisible(true);
        scrollToBottom(true);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setIsKeyboardVisible(false);
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [scrollToBottom]);

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

      // 1. Create and persist user message with role 'user'
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content,
        timestamp: Date.now(),
      };

      appendChatMessage(modelId, userMsg);
      const withUser = [...messages, userMsg];
      setMessages(withUser);
      scrollToBottom();

      // 2. Create and persist placeholder assistant message with role 'assistant'
      const assistantId = `assistant-${Date.now()}`;
      const placeholderAssistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };

      appendChatMessage(modelId, placeholderAssistantMsg);
      const withPlaceholder = [...withUser, placeholderAssistantMsg];
      setMessages(withPlaceholder);
      setActiveAssistantMsgId(assistantId);
      setStreamingContent('');
      scrollToBottom();

      let accumulated = '';

      try {
        await generateCompletion({
          modelId,
          messages: withUser,
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

        // Persist final assistant response by exact ID
        updateChatMessageContent(modelId, assistantId, accumulated);
      } catch (err: any) {
        if (!accumulated) {
          // Remove empty placeholder from state and storage
          setMessages(prev => prev.filter(m => m.id !== assistantId));
          const currentStored = getChatMessages(modelId);
          saveChatMessages(
            modelId,
            currentStored.filter(m => m.id !== assistantId)
          );
          Alert.alert('Inference Error', err?.message || 'Failed to generate response.');
        } else {
          updateChatMessageContent(modelId, assistantId, accumulated);
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
      messages,
      generateCompletion,
      scrollToBottom,
    ]
  );

  const handleStop = useCallback(async () => {
    try {
      await stopGeneration();
      if (activeAssistantMsgId && streamingContent) {
        updateChatMessageContent(modelId, activeAssistantMsgId, streamingContent);
      }
    } catch (err) {
      console.warn('Failed to stop generation:', err);
    } finally {
      setActiveAssistantMsgId(null);
      setStreamingContent('');
    }
  }, [stopGeneration, activeAssistantMsgId, streamingContent, modelId]);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Screen Header with proper top inset */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.surface,
            borderBottomColor: theme.divider,
            paddingTop: Math.max(insets.top, 12) + spacing.xs,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.7}
          onPress={handleBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
                ⏳ Loading context {loadProgress}%...
              </Text>
            ) : isGenerating ? (
              <Text style={[styles.statusText, { color: theme.primaryLight }]}>
                ⚡ Generating...
              </Text>
            ) : (
              <Text style={[styles.statusText, { color: theme.success }]}>
                ● Ready ({model?.quantLabel || 'Offline'})
              </Text>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={styles.clearButton}
          activeOpacity={0.7}
          onPress={handleClearChat}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={[styles.clearButtonText, { color: theme.error }]}>
            Clear
          </Text>
        </TouchableOpacity>
      </View>

      {/* Keyboard Avoiding Container */}
      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Messages List or Empty State */}
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
              100% Private & Offline inference.{'\n'}No telemetry, no internet required.
            </Text>

            <View style={styles.promptSuggestions}>
              <Text
                style={[
                  styles.suggestionHeader,
                  { color: theme.textMuted },
                ]}
              >
                PROMPT IDEAS:
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
                  activeOpacity={0.75}
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
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
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

        {/* Floating Input Bar */}
        <View
          style={[
            styles.inputContainer,
            {
              backgroundColor: theme.surface,
              borderTopColor: theme.divider,
              paddingBottom: isKeyboardVisible
                ? spacing.sm
                : Math.max(insets.bottom, spacing.sm),
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
                  {
                    color:
                      inputText.trim().length > 0 && !isModelLoading
                        ? theme.primaryForeground
                        : theme.textMuted,
                  },
                ]}
              >
                ▲ Send
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
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
    paddingBottom: spacing.sm + 4,
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
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyIconText: {
    fontSize: 30,
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
    lineHeight: 20,
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
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    gap: spacing.sm,
  },
  textInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderWidth: 1,
    fontSize: 14.5,
  },
  actionButton: {
    height: 44,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
});
