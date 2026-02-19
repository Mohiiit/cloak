/**
 * SplashScreen -- Premium loading screen shown during app initialization.
 *
 * Matches cloak.pen "Cloak - Splash Screen" (dark bg, glow, rings, particles, logo, text, loading bar),
 * animated with react-native-reanimated per the 2.5–3s timeline spec.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, InteractionManager, StyleSheet, Text, View } from "react-native";
import Svg, {
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { colors, typography } from "../lib/theme";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const BASE_W = 390;
const BASE_H = 844;
const SCALE = SCREEN_W / BASE_W;

const TIMING = {
  logoInMs: 800,
  innerRingDelayMs: 200,
  outerRingDelayMs: 400,
  textStartMs: 600,
  taglineDelayMs: 150,
  bottomStartMs: 1000,
  progressMs: 1400,
  exitStartMs: 2400,
  exitMs: 400,
} as const;

// Lucide shield path (same as CloakIcon)
const SHIELD_PATH =
  "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z";

type ParticleSpec = {
  x: number; // base px in 390x844 design space
  y: number; // base px in 390x844 design space
  size: number;
  fill: string; // rgba/8-digit hex
};

const PARTICLES: ParticleSpec[] = [
  { x: 80, y: 300, size: 3, fill: "#3B82F630" },
  { x: 310, y: 340, size: 2, fill: "#8B5CF625" },
  { x: 55, y: 430, size: 4, fill: "#3B82F618" },
  { x: 330, y: 270, size: 2, fill: "#8B5CF620" },
  { x: 290, y: 450, size: 3, fill: "#3B82F622" },
  { x: 100, y: 470, size: 2, fill: "#8B5CF618" },
];

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function Particle({
  spec,
  globalOpacity,
}: {
  spec: ParticleSpec;
  globalOpacity: SharedValue<number>;
}) {
  const dx = useSharedValue(0);
  const dy = useSharedValue(0);

  useEffect(() => {
    const ampX = (Math.random() * 2 - 1) * rand(3, 5) * SCALE;
    const ampY = (Math.random() * 2 - 1) * rand(3, 5) * SCALE;
    const duration = rand(2000, 3000);
    const delay = rand(0, 900);

    dx.value = withDelay(
      delay,
      withRepeat(
        withTiming(ampX, { duration, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      ),
    );
    dy.value = withDelay(
      delay,
      withRepeat(
        withTiming(ampY, { duration: duration + rand(0, 300), easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      ),
    );
  }, [dx, dy]);

  const style = useAnimatedStyle(() => ({
    opacity: globalOpacity.value,
    transform: [{ translateX: dx.value }, { translateY: dy.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.particle,
        {
          left: (spec.x / BASE_W) * SCREEN_W,
          top: (spec.y / BASE_H) * SCREEN_H,
          width: spec.size * SCALE,
          height: spec.size * SCALE,
          borderRadius: (spec.size * SCALE) / 2,
          backgroundColor: spec.fill,
        },
        style,
      ]}
    />
  );
}

interface Props {
  readyToExit: boolean;
  onFinished: () => void;
}

export default function SplashScreen({ readyToExit, onFinished }: Props) {
  const startAtMs = useRef(Date.now());
  const exitStarted = useRef(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [statusText, setStatusText] = useState("Initializing secure vault...");
  const readyRef = useRef(false);
  const statusTimer2 = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Phase 1
  const logoScale = useSharedValue(0.6);
  const logoOpacity = useSharedValue(0);
  const glowOpacity = useSharedValue(0);
  const innerRingOpacity = useSharedValue(0);
  const outerRingOpacity = useSharedValue(0);
  const particleOpacity = useSharedValue(0);

  // Phase 2
  const titleOpacity = useSharedValue(0);
  const titleY = useSharedValue(12);
  const taglineOpacity = useSharedValue(0);
  const taglineY = useSharedValue(12);

  // Phase 3
  const bottomOpacity = useSharedValue(0);
  const progress = useSharedValue(0);

  // Phase 4
  const exitOpacity = useSharedValue(1);
  const exitScale = useSharedValue(1);

  const handleFinished = useCallback(() => {
    onFinished();
  }, [onFinished]);

  const startExit = useCallback(() => {
    if (exitStarted.current) return;
    exitStarted.current = true;

    exitScale.value = withTiming(1.02, {
      duration: TIMING.exitMs,
      easing: Easing.in(Easing.cubic),
    });
    exitOpacity.value = withTiming(
      0,
      { duration: TIMING.exitMs, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(handleFinished)();
      },
    );
  }, [exitOpacity, exitScale, handleFinished]);

  const requestExit = useCallback(() => {
    if (exitStarted.current) return;
    const elapsed = Date.now() - startAtMs.current;
    const delay = Math.max(0, TIMING.exitStartMs - elapsed);

    if (exitTimer.current) clearTimeout(exitTimer.current);
    exitTimer.current = setTimeout(() => startExit(), delay);
  }, [startExit]);

  useEffect(() => {
    // Entrance timeline (0ms -> 2400ms).
    glowOpacity.value = withTiming(1, {
      duration: TIMING.logoInMs,
      easing: Easing.out(Easing.cubic),
    });
    particleOpacity.value = withDelay(
      150,
      withTiming(1, { duration: TIMING.logoInMs, easing: Easing.out(Easing.cubic) }),
    );
    logoOpacity.value = withTiming(1, {
      duration: TIMING.logoInMs,
      easing: Easing.out(Easing.cubic),
    });
    logoScale.value = withSpring(1, {
      stiffness: 110,
      damping: 14,
      mass: 0.9,
      overshootClamping: false,
    });

    innerRingOpacity.value = withDelay(
      TIMING.innerRingDelayMs,
      withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }),
    );
    outerRingOpacity.value = withDelay(
      TIMING.outerRingDelayMs,
      withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }),
    );

    titleOpacity.value = withDelay(
      TIMING.textStartMs,
      withTiming(1, {
        duration: 600,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      }),
    );
    titleY.value = withDelay(
      TIMING.textStartMs,
      withTiming(0, {
        duration: 600,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      }),
    );

    taglineOpacity.value = withDelay(
      TIMING.textStartMs + TIMING.taglineDelayMs,
      withTiming(1, {
        duration: 600,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      }),
    );
    taglineY.value = withDelay(
      TIMING.textStartMs + TIMING.taglineDelayMs,
      withTiming(0, {
        duration: 600,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      }),
    );

    bottomOpacity.value = withDelay(
      TIMING.bottomStartMs,
      withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }),
    );
    progress.value = withDelay(
      TIMING.bottomStartMs,
      withTiming(1, { duration: TIMING.progressMs, easing: Easing.inOut(Easing.cubic) }),
    );

    // Fixed status cycling — runs on a schedule regardless of readyToExit.
    statusTimer.current = setTimeout(() => {
      setStatusText("Connecting to Starknet...");
    }, 1200);
    statusTimer2.current = setTimeout(() => {
      setStatusText("Loading wallet...");
    }, 2000);

    return () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
      if (statusTimer.current) clearTimeout(statusTimer.current);
      if (statusTimer2.current) clearTimeout(statusTimer2.current);
    };
  }, [
    bottomOpacity,
    glowOpacity,
    innerRingOpacity,
    logoOpacity,
    logoScale,
    outerRingOpacity,
    particleOpacity,
    progress,
    taglineOpacity,
    taglineY,
    titleOpacity,
    titleY,
  ]);

  useEffect(() => {
    if (!readyToExit) return;
    readyRef.current = true;

    // Schedule "Ready" text near the end of the animation, not immediately.
    const elapsed = Date.now() - startAtMs.current;
    const readyTextDelay = Math.max(0, TIMING.exitStartMs - 400 - elapsed);

    const readyTimer = setTimeout(() => {
      setStatusText("Ready");
      // Clear cycling timers so they don't overwrite "Ready"
      if (statusTimer.current) { clearTimeout(statusTimer.current); statusTimer.current = null; }
      if (statusTimer2.current) { clearTimeout(statusTimer2.current); statusTimer2.current = null; }
    }, readyTextDelay);

    const handle = InteractionManager.runAfterInteractions(() => {
      requestExit();
    });

    return () => {
      clearTimeout(readyTimer);
      handle.cancel();
    };
  }, [readyToExit, requestExit]);

  const exitStyle = useAnimatedStyle(() => ({
    opacity: exitOpacity.value,
    transform: [{ scale: exitScale.value }],
  }));

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const innerRingStyle = useAnimatedStyle(() => ({
    opacity: innerRingOpacity.value,
  }));

  const outerRingStyle = useAnimatedStyle(() => ({
    opacity: outerRingOpacity.value,
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleY.value }],
  }));

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
    transform: [{ translateY: taglineY.value }],
  }));

  const bottomStyle = useAnimatedStyle(() => ({
    opacity: bottomOpacity.value,
  }));

  const trackWidth = useMemo(() => Math.round(120 * SCALE), []);
  const fillStyle = useAnimatedStyle(() => ({
    width: trackWidth * progress.value,
  }));

  const ringCenterY = SCREEN_H * (363 / BASE_H);
  const glowCenterY = SCREEN_H * (372 / BASE_H);
  const centerX = SCREEN_W / 2;

  return (
    <Animated.View style={[styles.root, exitStyle]} pointerEvents="auto">
      {/* Background: ambient glows + rings + particles */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Animated.View style={[StyleSheet.absoluteFill, glowStyle]}>
          <Svg width={SCREEN_W} height={SCREEN_H}>
            <Defs>
              <RadialGradient id="outerGlow" cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0%" stopColor="#3B82F6" stopOpacity={0.0627} />
                <Stop offset="40%" stopColor="#8B5CF6" stopOpacity={0.0314} />
                <Stop offset="100%" stopColor="#0A0F1C" stopOpacity={0} />
              </RadialGradient>
              <RadialGradient id="innerGlow" cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0%" stopColor="#3B82F6" stopOpacity={0.1255} />
                <Stop offset="50%" stopColor="#8B5CF6" stopOpacity={0.0941} />
                <Stop offset="100%" stopColor="#0A0F1C" stopOpacity={0} />
              </RadialGradient>
            </Defs>

            <Rect x={0} y={0} width={SCREEN_W} height={SCREEN_H} fill="#0A0F1C" />
            <Ellipse
              cx={centerX}
              cy={glowCenterY}
              rx={180 * SCALE}
              ry={180 * SCALE}
              fill="url(#outerGlow)"
            />
            <Ellipse
              cx={centerX}
              cy={glowCenterY}
              rx={100 * SCALE}
              ry={100 * SCALE}
              fill="url(#innerGlow)"
            />
          </Svg>
        </Animated.View>

        <Animated.View style={[StyleSheet.absoluteFill, innerRingStyle]}>
          <Svg width={SCREEN_W} height={SCREEN_H}>
            <Defs>
              <LinearGradient id="innerRing" x1="1" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor="#3B82F6" stopOpacity={0.0824} />
                <Stop offset="50%" stopColor="#8B5CF6" stopOpacity={0.0627} />
                <Stop offset="100%" stopColor="#3B82F6" stopOpacity={0.0196} />
              </LinearGradient>
            </Defs>
            <Ellipse
              cx={centerX}
              cy={ringCenterY}
              rx={110 * SCALE}
              ry={110 * SCALE}
              fill="none"
              stroke="url(#innerRing)"
              strokeWidth={1}
            />
          </Svg>
        </Animated.View>

        <Animated.View style={[StyleSheet.absoluteFill, outerRingStyle]}>
          <Svg width={SCREEN_W} height={SCREEN_H}>
            <Defs>
              <LinearGradient id="outerRing" x1="1" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor="#3B82F6" stopOpacity={0.0392} />
                <Stop offset="50%" stopColor="#8B5CF6" stopOpacity={0.0314} />
                <Stop offset="100%" stopColor="#3B82F6" stopOpacity={0.0118} />
              </LinearGradient>
            </Defs>
            <Ellipse
              cx={centerX}
              cy={ringCenterY}
              rx={150 * SCALE}
              ry={150 * SCALE}
              fill="none"
              stroke="url(#outerRing)"
              strokeWidth={1}
            />
          </Svg>
        </Animated.View>

        {PARTICLES.map((p, i) => (
          <Particle key={i} spec={p} globalOpacity={particleOpacity} />
        ))}
      </View>

      {/* Phase 1+2: logo + text */}
      <View style={styles.content} pointerEvents="none">
        <View style={styles.logoStack}>
          <Animated.View style={[styles.logoShadow, logoStyle]}>
            <View style={styles.logoClip}>
              <Svg width={110 * SCALE} height={110 * SCALE} viewBox="0 0 110 110">
                <Defs>
                  <LinearGradient
                    id="logoBg"
                    x1="0"
                    y1="0"
                    x2="110"
                    y2="110"
                    gradientUnits="userSpaceOnUse"
                  >
                    <Stop offset="0%" stopColor={colors.primary} />
                    <Stop offset="100%" stopColor={colors.secondary} />
                  </LinearGradient>
                </Defs>
                <Rect width={110} height={110} rx={28} fill="url(#logoBg)" />
                <G transform="translate(25, 25) scale(2.5)">
                  <Path
                    d={SHIELD_PATH}
                    fill="none"
                    stroke="white"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </G>
              </Svg>
            </View>
          </Animated.View>

          <Animated.Text style={[styles.title, titleStyle]}>Cloak</Animated.Text>
          <Animated.Text style={[styles.tagline, taglineStyle]}>
            Shielded Payments on Starknet
          </Animated.Text>
        </View>
      </View>

      {/* Phase 3: loading */}
      <Animated.View style={[styles.bottomArea, bottomStyle]} pointerEvents="none">
        <View style={[styles.loadingTrack, { width: trackWidth }]}>
          <Animated.View style={[styles.loadingFill, fillStyle]}>
            <Svg width="100%" height={3} preserveAspectRatio="none">
              <Defs>
                <LinearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0%" stopColor={colors.primary} />
                  <Stop offset="100%" stopColor={colors.secondary} />
                </LinearGradient>
              </Defs>
              <Rect x={0} y={0} width="100%" height={3} rx={2} fill="url(#barGrad)" />
            </Svg>
          </Animated.View>
        </View>

        <Text style={styles.loadingText} numberOfLines={1}>
          {statusText}
        </Text>
        <Text style={styles.version}>v0.1.0-alpha</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0A0F1C",
    zIndex: 9999,
    elevation: 9999,
  },
  content: {
    flex: 1,
    alignItems: "center",
  },
  logoStack: {
    position: "absolute",
    top: SCREEN_H * (280 / BASE_H),
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 28,
  },
  logoShadow: {
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 18,
  },
  logoClip: {
    borderRadius: 28 * SCALE,
    overflow: "hidden",
  },
  title: {
    fontFamily: typography.primarySemibold,
    fontSize: 40,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: 1,
  },
  tagline: {
    fontFamily: typography.secondary,
    fontSize: 14,
    fontWeight: "400",
    color: colors.textMuted,
    letterSpacing: 0.5,
    opacity: 0.92,
  },
  bottomArea: {
    position: "absolute",
    left: 0,
    right: 0,
    top: SCREEN_H * (720 / BASE_H),
    alignItems: "center",
    gap: 24,
    paddingHorizontal: 24,
  },
  loadingTrack: {
    height: 3,
    backgroundColor: colors.surface,
    borderRadius: 2,
    overflow: "hidden",
  },
  loadingFill: {
    height: 3,
  },
  loadingText: {
    fontFamily: typography.primary,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 0.5,
    opacity: 0.95,
  },
  version: {
    fontFamily: typography.primary,
    fontSize: 10,
    color: "#64748B50",
    letterSpacing: 0.5,
  },
  particle: {
    position: "absolute",
  },
});
