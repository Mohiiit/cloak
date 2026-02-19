/**
 * SplashScreen -- Premium loading screen shown during app initialization.
 *
 * Uses React Native's built-in Animated API (no native reanimated dependency).
 * 4-phase timeline: logo entrance → text reveal → loading bar → exit fade.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  InteractionManager,
  StyleSheet,
  Text,
  View,
} from "react-native";
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

const SHIELD_PATH =
  "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z";

type ParticleSpec = {
  x: number;
  y: number;
  size: number;
  fill: string;
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
  globalOpacity: Animated.Value;
}) {
  const dx = useRef(new Animated.Value(0)).current;
  const dy = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const ampX = (Math.random() * 2 - 1) * rand(3, 5) * SCALE;
    const ampY = (Math.random() * 2 - 1) * rand(3, 5) * SCALE;
    const duration = rand(2000, 3000);
    const delay = rand(0, 900);

    const loopX = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.sequence([
          Animated.timing(dx, {
            toValue: ampX,
            duration,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(dx, {
            toValue: 0,
            duration,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    const loopY = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.sequence([
          Animated.timing(dy, {
            toValue: ampY,
            duration: duration + rand(0, 300),
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(dy, {
            toValue: 0,
            duration: duration + rand(0, 300),
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    loopX.start();
    loopY.start();

    return () => {
      loopX.stop();
      loopY.stop();
    };
  }, [dx, dy]);

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
          opacity: globalOpacity,
          transform: [{ translateX: dx }, { translateY: dy }],
        },
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
  const statusTimer2 = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [statusText, setStatusText] = useState("Initializing secure vault...");

  // Phase 1
  const logoScale = useRef(new Animated.Value(0.6)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const innerRingOpacity = useRef(new Animated.Value(0)).current;
  const outerRingOpacity = useRef(new Animated.Value(0)).current;
  const particleOpacity = useRef(new Animated.Value(0)).current;

  // Phase 2
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleY = useRef(new Animated.Value(12)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineY = useRef(new Animated.Value(12)).current;

  // Phase 3
  const bottomOpacity = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;

  // Phase 4
  const exitOpacity = useRef(new Animated.Value(1)).current;
  const exitScale = useRef(new Animated.Value(1)).current;

  const trackWidth = useMemo(() => Math.round(120 * SCALE), []);

  const startExit = useCallback(() => {
    if (exitStarted.current) return;
    exitStarted.current = true;

    Animated.parallel([
      Animated.timing(exitScale, {
        toValue: 1.02,
        duration: TIMING.exitMs,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(exitOpacity, {
        toValue: 0,
        duration: TIMING.exitMs,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) onFinished();
    });
  }, [exitOpacity, exitScale, onFinished]);

  const requestExit = useCallback(() => {
    if (exitStarted.current) return;
    const elapsed = Date.now() - startAtMs.current;
    const delay = Math.max(0, TIMING.exitStartMs - elapsed);

    if (exitTimer.current) clearTimeout(exitTimer.current);
    exitTimer.current = setTimeout(() => startExit(), delay);
  }, [startExit]);

  useEffect(() => {
    // Phase 1: Logo entrance (0 → 800ms)
    Animated.timing(glowOpacity, {
      toValue: 1,
      duration: TIMING.logoInMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    Animated.sequence([
      Animated.delay(150),
      Animated.timing(particleOpacity, {
        toValue: 1,
        duration: TIMING.logoInMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    Animated.timing(logoOpacity, {
      toValue: 1,
      duration: TIMING.logoInMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    Animated.spring(logoScale, {
      toValue: 1,
      stiffness: 110,
      damping: 14,
      mass: 0.9,
      useNativeDriver: true,
    }).start();

    // Rings staggered
    Animated.sequence([
      Animated.delay(TIMING.innerRingDelayMs),
      Animated.timing(innerRingOpacity, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    Animated.sequence([
      Animated.delay(TIMING.outerRingDelayMs),
      Animated.timing(outerRingOpacity, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // Phase 2: Text reveal (600ms → 1200ms)
    const textEasing = Easing.bezier(0.25, 0.1, 0.25, 1);

    Animated.sequence([
      Animated.delay(TIMING.textStartMs),
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 600,
          easing: textEasing,
          useNativeDriver: true,
        }),
        Animated.timing(titleY, {
          toValue: 0,
          duration: 600,
          easing: textEasing,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    Animated.sequence([
      Animated.delay(TIMING.textStartMs + TIMING.taglineDelayMs),
      Animated.parallel([
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 600,
          easing: textEasing,
          useNativeDriver: true,
        }),
        Animated.timing(taglineY, {
          toValue: 0,
          duration: 600,
          easing: textEasing,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Phase 3: Loading bar (1000ms → 2400ms)
    Animated.sequence([
      Animated.delay(TIMING.bottomStartMs),
      Animated.timing(bottomOpacity, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // Progress bar width can't use native driver, so use JS driver
    Animated.sequence([
      Animated.delay(TIMING.bottomStartMs),
      Animated.timing(progress, {
        toValue: 1,
        duration: TIMING.progressMs,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();

    // Fixed status cycling
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
  }, []);

  useEffect(() => {
    if (!readyToExit) return;

    // Schedule "Ready" text near the end of the animation.
    const elapsed = Date.now() - startAtMs.current;
    const readyTextDelay = Math.max(0, TIMING.exitStartMs - 400 - elapsed);

    const readyTimer = setTimeout(() => {
      setStatusText("Ready");
      if (statusTimer.current) {
        clearTimeout(statusTimer.current);
        statusTimer.current = null;
      }
      if (statusTimer2.current) {
        clearTimeout(statusTimer2.current);
        statusTimer2.current = null;
      }
    }, readyTextDelay);

    const handle = InteractionManager.runAfterInteractions(() => {
      requestExit();
    });

    return () => {
      clearTimeout(readyTimer);
      handle.cancel();
    };
  }, [readyToExit, requestExit]);

  const ringCenterY = SCREEN_H * (363 / BASE_H);
  const glowCenterY = SCREEN_H * (372 / BASE_H);
  const centerX = SCREEN_W / 2;

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, trackWidth],
  });

  return (
    <Animated.View
      style={[
        styles.root,
        { opacity: exitOpacity, transform: [{ scale: exitScale }] },
      ]}
      pointerEvents="auto"
    >
      {/* Background: ambient glows + rings + particles */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: glowOpacity }]}>
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

        <Animated.View style={[StyleSheet.absoluteFill, { opacity: innerRingOpacity }]}>
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

        <Animated.View style={[StyleSheet.absoluteFill, { opacity: outerRingOpacity }]}>
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
          <Animated.View
            style={[
              styles.logoShadow,
              {
                opacity: logoOpacity,
                transform: [{ scale: logoScale }],
              },
            ]}
          >
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

          <Animated.Text
            style={[
              styles.title,
              {
                opacity: titleOpacity,
                transform: [{ translateY: titleY }],
              },
            ]}
          >
            Cloak
          </Animated.Text>
          <Animated.Text
            style={[
              styles.tagline,
              {
                opacity: taglineOpacity,
                transform: [{ translateY: taglineY }],
              },
            ]}
          >
            Shielded Payments on Starknet
          </Animated.Text>
        </View>
      </View>

      {/* Phase 3: loading */}
      <Animated.View
        style={[styles.bottomArea, { opacity: bottomOpacity }]}
        pointerEvents="none"
      >
        <View style={[styles.loadingTrack, { width: trackWidth }]}>
          <Animated.View style={[styles.loadingFill, { width: progressWidth }]}>
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
