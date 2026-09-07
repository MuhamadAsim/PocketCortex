import { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Models: undefined;
  Chat: { modelId: string };
};

export type ModelsScreenNavigationProps = NativeStackScreenProps<
  RootStackParamList,
  'Models'
>;

export type ChatScreenNavigationProps = NativeStackScreenProps<
  RootStackParamList,
  'Chat'
>;
