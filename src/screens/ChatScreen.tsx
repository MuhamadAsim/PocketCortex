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
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DocumentPicker, { types } from 'react-native-document-picker';
import { getModelById } from '../constants/modelCatalog';
import { ChatMessage, GroundedSource } from '../types/models';
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
import { knowledgeService } from '../services/knowledgeService';
import { formatRAGSystemPrompt } from '../utils/promptTemplates';
import { useResourceGuard } from '../hooks/useResourceGuard';

export interface ChatScreenProps {
  navigation?: any;
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
  const resourceState = useResourceGuard();

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    getChatMessages(modelId)
  );
  const [inputText, setInputText] = useState('');
  const [streamingContent, setStreamingContent] = useState('');
  const [activeAssistantMsgId, setActiveAssistantMsgId] = useState<string | null>(
    null
  );
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isSearchEnabled, setIsSearchEnabled] = useState(true);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);

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

  const handlePickImage = useCallback(async () => {
    try {
      const res = await DocumentPicker.pickSingle({
        type: [types.images],
        copyTo: 'cachesDirectory',
      });
      const uri = res.fileCopyUri || res.uri;
      setSelectedImageUri(uri);
    } catch (err) {
      if (!DocumentPicker.isCancel(err)) {
        Alert.alert('Error', 'Failed to pick image.');
      }
    }
  }, []);

  const handleSend = useCallback(
    async (textToSend?: string) => {
      if (resourceState.mode === 'INDEXING') {
        Alert.alert(
          'Resource Guard Active',
          'Document indexing is currently active. Chat inference is paused to protect device memory.'
        );
        return;
      }

      const content = (textToSend || inputText).trim();
      const currentImage = selectedImageUri;
      if ((!content && !currentImage) || isGenerating) return;

      setInputText('');
      setSelectedImageUri(null);

      // Perform RAG retrieval if search is enabled
      let groundedSources: GroundedSource[] = [];
      let systemPrompt: string | undefined;

      if (isSearchEnabled && content) {
        try {
          const hits = await knowledgeService.searchKnowledge(content, 3);
          if (hits && hits.length > 0) {
            groundedSources = hits;
            systemPrompt = formatRAGSystemPrompt(undefined, hits);
          } else {
            const docs = await knowledgeService.getDocuments();
            if (docs && docs.length > 0) {
              systemPrompt = formatRAGSystemPrompt(
                undefined,
                [],
                docs.map(d => d.name)
              );
            }
          }
        } catch (searchErr) {
          console.warn('RAG Search warning:', searchErr);
        }
      }

      // 1. Create and persist user message with role 'user'
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content,
        timestamp: Date.now(),
        imageUri: currentImage || undefined,
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
        sources: groundedSources.length > 0 ? groundedSources : undefined,
      };

      appendChatMessage(modelId, placeholderAssistantMsg);
      const withPlaceholder = [...withUser, placeholderAssistantMsg];
      setMessages(withPlaceholder);
      setActiveAssistantMsgId(assistantId);
      setStreamingContent('');
      scrollToBottom();

      let accumulated = '';

      try {
        let mediaPath = currentImage || undefined;
        if (mediaPath && mediaPath.startsWith('file://')) {
          mediaPath = mediaPath.slice(7);
        }

        await generateCompletion({
          modelId,
          messages: withUser,
          systemPrompt,
          mediaPaths: mediaPath ? [mediaPath] : undefined,
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
      selectedImageUri,
      isSearchEnabled,
      resourceState.mode,
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

      {/* Subheader: RAG Docs Search Toggle + Knowledge Base Shortcut */}
      <View
        style={[
          styles.toolbar,
          { backgroundColor: theme.surface, borderBottomColor: theme.divider },
        ]}
      >
        <TouchableOpacity
          onPress={() => setIsSearchEnabled(!isSearchEnabled)}
          style={[
            styles.togglePill,
            isSearchEnabled
              ? { backgroundColor: theme.primaryLight + '20', borderColor: theme.primaryLight + '60' }
              : { backgroundColor: theme.badgeBg, borderColor: theme.badgeBorder },
          ]}
        >
          <Text
            style={[
              styles.togglePillText,
              { color: isSearchEnabled ? theme.primaryLight : theme.textMuted },
            ]}
          >
            {isSearchEnabled ? '🔍 Ground with Docs: ON' : '🔍 Ground with Docs: OFF'}
          </Text>
        </TouchableOpacity>

        {navigation && (
          <TouchableOpacity
            onPress={() => navigation.navigate('Knowledge')}
            style={[styles.knowledgeButton, { backgroundColor: theme.badgeBg, borderColor: theme.badgeBorder }]}
          >
            <Text style={[styles.knowledgeButtonText, { color: theme.textSecondary }]}>
              📚 Manage Docs
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Resource Guard Indexing Alert */}
      {resourceState.mode === 'INDEXING' && (
        <View style={[styles.guardNotice, { backgroundColor: theme.warningBg }]}>
          <Text style={[styles.guardNoticeText, { color: theme.warning }]}>
            🛡️ Indexing knowledge base ({resourceState.indexingProgress?.percent || 0}%). Chat is paused.
          </Text>
        </View>
      )}

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

        {/* Selected Image Thumbnail Preview */}
        {selectedImageUri && (
          <View style={[styles.imagePreviewBar, { backgroundColor: theme.surface, borderTopColor: theme.divider }]}>
            <View style={styles.imageThumbContainer}>
              <Image source={{ uri: selectedImageUri }} style={styles.imageThumb} />
              <TouchableOpacity
                onPress={() => setSelectedImageUri(null)}
                style={[styles.removeImageBtn, { backgroundColor: theme.card }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.removeImageBtnText, { color: theme.error }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.imageThumbLabel, { color: theme.textSecondary }]}>
              Image attached for {model?.name}
            </Text>
          </View>
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
          {model?.isMultimodal && (
            <TouchableOpacity
              onPress={handlePickImage}
              style={[
                styles.attachButton,
                { backgroundColor: theme.badgeBg, borderColor: theme.badgeBorder },
              ]}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.attachButtonText}>📷</Text>
            </TouchableOpacity>
          )}

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
                : model?.isMultimodal
                ? 'Type or attach an image...'
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
                    (inputText.trim().length > 0 || !!selectedImageUri) && !isModelLoading
                      ? theme.primary
                      : theme.badgeBorder,
                },
              ]}
              activeOpacity={0.8}
              disabled={
                (inputText.trim().length === 0 && !selectedImageUri) ||
                isModelLoading
              }
              onPress={() => handleSend()}
            >
              <Text
                style={[
                  styles.actionButtonText,
                  {
                    color:
                      (inputText.trim().length > 0 || !!selectedImageUri) && !isModelLoading
                        ? theme.primaryForeground
                        : theme.textMuted,
                  },
                ]}
              >
                Send
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
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  togglePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  togglePillText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  knowledgeButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  knowledgeButtonText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  guardNotice: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  guardNoticeText: {
    fontSize: 11.5,
    fontWeight: '600',
    textAlign: 'center',
  },
  imagePreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 10,
  },
  imageThumbContainer: {
    position: 'relative',
  },
  imageThumb: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
  },
  removeImageBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
    elevation: 2,
  },
  removeImageBtnText: {
    fontSize: 10,
    fontWeight: '800',
  },
  imageThumbLabel: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  attachButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  attachButtonText: {
    fontSize: 18,
  },
});
