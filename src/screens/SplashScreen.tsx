import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Animated,
  StatusBar,
  Dimensions,
  TouchableOpacity,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SplashScreenNavigationProps } from '../navigation/types';
import { darkColors, spacing, radius } from '../theme/theme';

const { width } = Dimensions.get('window');

const STATUS_MESSAGES = [
  'Initializing neural runtime...',
  'Preparing offline models...',
  'PocketCortex ready',
];

export const SplashScreen: React.FC<SplashScreenNavigationProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [statusIndex, setStatusIndex] = useState(0);

  // Animations
  const logoScale = useRef(new Animated.Value(0.7)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(16)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const screenFadeAnim = useRef(new Animated.Value(1)).current;

  const hasNavigated = useRef(false);

  const navigateToHome = () => {
    if (hasNavigated.current) {
      return;
    }
    hasNavigated.current = true;

    Animated.timing(screenFadeAnim, {
      toValue: 0,
      duration: 350,
      useNativeDriver: true,
    }).start(() => {
      navigation.replace('Models');
    });
  };

  useEffect(() => {
    // 1. Entrance animation for Logo
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 6,
        tension: 50,
        useNativeDriver: true,
      }),
    ]).start();

    // 2. Sequential entrance for brand text and tagline
    Animated.sequence([
      Animated.delay(300),
      Animated.parallel([
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(contentTranslateY, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // 3. Progress bar animation over 2000ms
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 2000,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: false,
    }).start();

    // 4. Continuous pulsing aura around the logo
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();

    // 5. Status message steps
    const timer1 = setTimeout(() => setStatusIndex(1), 800);
    const timer2 = setTimeout(() => setStatusIndex(2), 1600);

    // 6. Transition to main screen
    const finishTimer = setTimeout(() => {
      navigateToHome();
    }, 2400);

    return () => {
      pulseLoop.stop();
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(finishTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={navigateToHome}
      style={styles.container}
    >
      <StatusBar barStyle="light-content" />

      <Animated.View
        style={[
          styles.contentWrapper,
          {
            opacity: screenFadeAnim,
            paddingTop: Math.max(insets.top, 24) + spacing.xl,
            paddingBottom: Math.max(insets.bottom, 24) + spacing.md,
          },
        ]}
      >
        {/* Ambient background glow circle */}
        <View style={styles.ambientBackgroundCircle} />

        {/* Center: Logo & Brand Identity */}
        <View style={styles.centerSection}>
          {/* Pulsing Aura */}
          <Animated.View
            style={[
              styles.pulseRing,
              {
                transform: [{ scale: pulseAnim }],
              },
            ]}
          />

          {/* Logo Container */}
          <Animated.View
            style={[
              styles.logoCard,
              {
                opacity: logoOpacity,
                transform: [{ scale: logoScale }],
              },
            ]}
          >
            <Image
              source={require('../assets/logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </Animated.View>

          {/* Text Branding & Tagline */}
          <Animated.View
            style={[
              styles.brandTextGroup,
              {
                opacity: contentOpacity,
                transform: [{ translateY: contentTranslateY }],
              },
            ]}
          >
            <Text style={styles.brandTitle}>PocketCortex</Text>
            <Text style={styles.tagline}>On-Device Offline Intelligence</Text>
            <Text style={styles.subTagline}>
              100% Private • Local Neural Engine
            </Text>

            {/* Feature Badges */}
            <View style={styles.badgesRow}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>⚡ Fast & Local</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>🔒 Fully Offline</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>🧠 GGUF Powered</Text>
              </View>
            </View>
          </Animated.View>
        </View>

        {/* Bottom Section: Progress Bar, Status, and Footer */}
        <Animated.View
          style={[
            styles.bottomSection,
            {
              opacity: contentOpacity,
            },
          ]}
        >
          {/* Progress Bar */}
          <View style={styles.progressBarTrack}>
            <Animated.View
              style={[
                styles.progressBarFill,
                {
                  width: progressWidth,
                },
              ]}
            />
          </View>

          {/* Status Message */}
          <Text style={styles.statusText}>{STATUS_MESSAGES[statusIndex]}</Text>

          {/* Footer details */}
          <View style={styles.footerInfo}>
            <Text style={styles.versionText}>PocketCortex v0.0.1</Text>
            <Text style={styles.skipHintText}>Tap anywhere to continue</Text>
          </View>
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: darkColors.background,
  },
  contentWrapper: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  ambientBackgroundCircle: {
    position: 'absolute',
    top: '30%',
    width: width * 0.9,
    height: width * 0.9,
    borderRadius: (width * 0.9) / 2,
    backgroundColor: 'rgba(99, 102, 241, 0.07)',
  },
  centerSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  pulseRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 36,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.25)',
  },
  logoCard: {
    width: 110,
    height: 110,
    borderRadius: 28,
    backgroundColor: darkColors.surface,
    borderWidth: 1.5,
    borderColor: 'rgba(99, 102, 241, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: darkColors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 12,
  },
  logoImage: {
    width: 76,
    height: 76,
    borderRadius: 16,
  },
  brandTextGroup: {
    alignItems: 'center',
    marginTop: spacing.xxl,
  },
  brandTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: darkColors.textPrimary,
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 16,
    fontWeight: '600',
    color: darkColors.primaryLight,
    marginTop: spacing.xs + 2,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  subTagline: {
    fontSize: 13,
    color: darkColors.textSecondary,
    marginTop: spacing.xs,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  badge: {
    backgroundColor: darkColors.surface,
    borderWidth: 1,
    borderColor: darkColors.cardBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: radius.full,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: darkColors.textSecondary,
    letterSpacing: 0.2,
  },
  bottomSection: {
    width: '100%',
    alignItems: 'center',
    maxWidth: 320,
  },
  progressBarTrack: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: radius.full,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: darkColors.primary,
    borderRadius: radius.full,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500',
    color: darkColors.textSecondary,
    marginBottom: spacing.lg,
    letterSpacing: 0.2,
  },
  footerInfo: {
    alignItems: 'center',
    gap: 2,
  },
  versionText: {
    fontSize: 11,
    fontWeight: '500',
    color: darkColors.textMuted,
    letterSpacing: 0.3,
  },
  skipHintText: {
    fontSize: 10,
    color: 'rgba(148, 163, 184, 0.4)',
    letterSpacing: 0.2,
    marginTop: 2,
  },
});
