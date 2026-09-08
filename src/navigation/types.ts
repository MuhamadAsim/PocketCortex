import { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Splash: undefined;
  Models: undefined;
  Chat: { modelId: string };
  Knowledge: undefined;
};

export type SplashScreenNavigationProps = NativeStackScreenProps<
  RootStackParamList,
  'Splash'
>;

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
