import { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Models: undefined;
  Chat: { modelId: string };
  Knowledge: undefined;
};

export type ModelsScreenNavigationProps = NativeStackScreenProps<
  RootStackParamList,
  'Models'
>;

export type ChatScreenNavigationProps = NativeStackScreenProps<
  RootStackParamList,
  'Chat'
>;

export type KnowledgeScreenNavigationProps = NativeStackScreenProps<
  RootStackParamList,
  'Knowledge'
>;
