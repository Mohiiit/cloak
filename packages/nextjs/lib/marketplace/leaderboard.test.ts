import { describe, it, expect } from "vitest";
import { normalizeMetric, scoreAgent } from "./leaderboard";

describe("leaderboard", () => {
  describe("normalizeMetric", () => {
    it("returns 0 for min value", () => {
      expect(normalizeMetric(0, 0, 100)).toBe(0);
    });

    it("returns 1 for max value", () => {
      expect(normalizeMetric(100, 0, 100)).toBe(1);
    });

    it("returns 0.5 for midpoint", () => {
      expect(normalizeMetric(50, 0, 100)).toBe(0.5);
    });

    it("clamps below min", () => {
      expect(normalizeMetric(-10, 0, 100)).toBe(0);
    });

    it("clamps above max", () => {
      expect(normalizeMetric(200, 0, 100)).toBe(1);
    });

    it("returns 0 when max === min", () => {
      expect(normalizeMetric(5, 5, 5)).toBe(0);
    });
  });

  describe("scoreAgent", () => {
    it("returns 0 for an agent with no activity", () => {
      const score = scoreAgent(
        {
          successfulRuns: 0,
          settledVolume: 0,
          successRate: 0,
          trustScore: 0,
          freshness: 0,
        },
        { maxRuns: 10, maxVolume: 1000 },
      );
      expect(score).toBe(0);
    });

    it("returns ~1 for a perfect agent", () => {
      const score = scoreAgent(
        {
          successfulRuns: 100,
          settledVolume: 10000,
          successRate: 1,
          trustScore: 100,
          freshness: 1,
        },
        { maxRuns: 100, maxVolume: 10000 },
      );
      expect(score).toBeCloseTo(1, 4);
    });

    it("weights runs more than trust", () => {
      const highRuns = scoreAgent(
        {
          successfulRuns: 50,
          settledVolume: 0,
          successRate: 0,
          trustScore: 0,
          freshness: 0,
        },
        { maxRuns: 50, maxVolume: 1 },
      );
      const highTrust = scoreAgent(
        {
          successfulRuns: 0,
          settledVolume: 0,
          successRate: 0,
          trustScore: 100,
          freshness: 0,
        },
        { maxRuns: 50, maxVolume: 1 },
      );
      expect(highRuns).toBeGreaterThan(highTrust);
    });

    it("produces scores between 0 and 1", () => {
      for (let i = 0; i < 20; i++) {
        const score = scoreAgent(
          {
            successfulRuns: Math.random() * 100,
            settledVolume: Math.random() * 10000,
            successRate: Math.random(),
            trustScore: Math.random() * 100,
            freshness: Math.random(),
          },
          { maxRuns: 100, maxVolume: 10000 },
        );
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    });
  });
});
