import React from 'react';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
  Theme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { ModelsScreen } from '../screens/ModelsScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { KnowledgeScreen } from '../screens/KnowledgeScreen';
import { useTheme } from '../theme/ThemeContext';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator: React.FC = () => {
  const { theme, isDark } = useTheme();

  const baseTheme = isDark ? DarkTheme : DefaultTheme;

  const navigationTheme: Theme = {
    ...baseTheme,
    dark: isDark,
    colors: {
      ...baseTheme.colors,
      primary: theme.primary,
      background: theme.background,
      card: theme.surface,
      text: theme.textPrimary,
      border: theme.divider,
      notification: theme.primaryLight,
    },
  };

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        initialRouteName="Models"
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: theme.background },
        }}
      >
        <Stack.Screen name="Models" component={ModelsScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="Knowledge" component={KnowledgeScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
