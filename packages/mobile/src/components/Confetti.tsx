/**
 * Confetti — Simple falling confetti animation using React Native's Animated API.
 * Renders 25 small colored rectangles that fall from the top with random positions and rotation.
 * Auto-plays on mount with ~2 second duration, then fades out.
 */
import React, { useEffect, useRef } from "react";
import { View, Animated, StyleSheet, Dimensions } from "react-native";

const CONFETTI_COLORS = ["#10B981", "#3B82F6", "#8B5CF6", "#F59E0B"];
const PIECE_COUNT = 25;
const DURATION = 2000;

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type ConfettiPiece = {
  x: number;
  width: number;
  height: number;
  color: string;
  delay: number;
  rotateEnd: string;
};

function generatePieces(): ConfettiPiece[] {
  const pieces: ConfettiPiece[] = [];
  for (let i = 0; i < PIECE_COUNT; i++) {
    pieces.push({
      x: Math.random() * (SCREEN_WIDTH - 20),
      width: 6 + Math.random() * 6,
      height: 10 + Math.random() * 8,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: Math.random() * 400,
      rotateEnd: `${180 + Math.random() * 360}deg`,
    });
  }
  return pieces;
}

export function Confetti() {
  const pieces = useRef(generatePieces()).current;
  const fallAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fallAnim, {
        toValue: 1,
        duration: DURATION,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(DURATION * 0.6),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: DURATION * 0.4,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [fallAnim, opacityAnim]);

  return (
    <Animated.View style={[styles.container, { opacity: opacityAnim }]} pointerEvents="none">
      {pieces.map((piece, index) => {
        const translateY = fallAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [-20, 500],
        });
        const rotate = fallAnim.interpolate({
          inputRange: [0, 1],
          outputRange: ["0deg", piece.rotateEnd],
        });
        const horizontalDrift = fallAnim.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [0, (index % 2 === 0 ? 1 : -1) * (10 + Math.random() * 20), (index % 2 === 0 ? -1 : 1) * 15],
        });

        return (
          <Animated.View
            key={index}
            style={[
              styles.piece,
              {
                left: piece.x,
                width: piece.width,
                height: piece.height,
                backgroundColor: piece.color,
                borderRadius: 2,
                transform: [
                  { translateY },
                  { translateX: horizontalDrift },
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
    top: 0,
  },
});
