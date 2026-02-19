/**
 * Confetti — Burst-style confetti animation.
 * Pieces explode outward from center, then fall with gravity and gentle drift.
 * Auto-plays on mount with ~2.5s duration, fades out at the end.
 */
import React, { useEffect, useRef } from "react";
import { View, Animated, StyleSheet, Dimensions, Easing } from "react-native";

const CONFETTI_COLORS = ["#10B981", "#3B82F6", "#8B5CF6", "#F59E0B", "#EC4899", "#F97316"];
const PIECE_COUNT = 30;
const BURST_DURATION = 600;
const FALL_DURATION = 1800;
const TOTAL_DURATION = BURST_DURATION + FALL_DURATION;

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type ConfettiPiece = {
  startX: number;
  burstX: number;
  burstY: number;
  finalY: number;
  driftX: number;
  width: number;
  height: number;
  color: string;
  delay: number;
  rotateEnd: string;
  shape: "rect" | "circle";
};

function generatePieces(): ConfettiPiece[] {
  const cx = SCREEN_WIDTH / 2;
  const pieces: ConfettiPiece[] = [];
  for (let i = 0; i < PIECE_COUNT; i++) {
    const angle = (Math.PI * 2 * i) / PIECE_COUNT + (Math.random() - 0.5) * 0.5;
    const burstRadius = 80 + Math.random() * 100;
    pieces.push({
      startX: cx - 4,
      burstX: Math.cos(angle) * burstRadius,
      burstY: -Math.abs(Math.sin(angle) * burstRadius) - 20 - Math.random() * 60,
      finalY: 300 + Math.random() * 200,
      driftX: (Math.random() - 0.5) * 40,
      width: 5 + Math.random() * 5,
      height: 8 + Math.random() * 8,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: Math.random() * 150,
      rotateEnd: `${360 + Math.random() * 720}deg`,
      shape: Math.random() > 0.5 ? "rect" : "circle",
    });
  }
  return pieces;
}

export function Confetti() {
  const pieces = useRef(generatePieces()).current;
  const burstAnim = useRef(new Animated.Value(0)).current;
  const fallAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      // Phase 1: Burst outward
      Animated.timing(burstAnim, {
        toValue: 1,
        duration: BURST_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      // Phase 2: Fall with gravity
      Animated.parallel([
        Animated.timing(fallAnim, {
          toValue: 1,
          duration: FALL_DURATION,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(FALL_DURATION * 0.4),
          Animated.timing(opacityAnim, {
            toValue: 0,
            duration: FALL_DURATION * 0.6,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  }, [burstAnim, fallAnim, opacityAnim]);

  return (
    <Animated.View style={[styles.container, { opacity: opacityAnim }]} pointerEvents="none">
      {pieces.map((piece, index) => {
        // Burst phase: explode outward from center
        const burstTranslateX = burstAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, piece.burstX],
        });
        const burstTranslateY = burstAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, piece.burstY],
        });

        // Fall phase: gravity + drift
        const fallTranslateY = fallAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, piece.finalY],
        });
        const fallDriftX = fallAnim.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [0, piece.driftX, piece.driftX * 0.6],
        });

        // Rotation across both phases
        const rotate = Animated.add(burstAnim, fallAnim).interpolate({
          inputRange: [0, 2],
          outputRange: ["0deg", piece.rotateEnd],
        });

        return (
          <Animated.View
            key={index}
            style={[
              styles.piece,
              {
                left: piece.startX,
                top: "40%",
                width: piece.width,
                height: piece.shape === "circle" ? piece.width : piece.height,
                backgroundColor: piece.color,
                borderRadius: piece.shape === "circle" ? piece.width / 2 : 2,
                transform: [
                  { translateX: Animated.add(burstTranslateX, fallDriftX) },
                  { translateY: Animated.add(burstTranslateY, fallTranslateY) },
                  { rotate },
                ],
              },
            ]}
          />
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    zIndex: 10,
  },
  piece: {
    position: "absolute",
  },
});
