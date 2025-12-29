import { BehaviorModifier } from '../prompts/types';
import { SessionMetricsData } from './analyzer';

export interface BehaviorAdaptation {
  modifier: BehaviorModifier;
  reason: string;
}

export class BehaviorAdapter {
  /**
   * Determine behavior modifier based on session metrics
   */
  adaptBehavior(metrics: SessionMetricsData): BehaviorAdaptation {
    // High evasiveness -> escalate (be more direct)
    if (metrics.evasiveness > 0.6) {
      return {
        modifier: 'escalate',
        reason: 'High evasiveness detected - increasing directness',
      };
    }

    // High contradiction -> repeat (clarify position)
    if (metrics.contradiction > 0.5) {
      return {
        modifier: 'repeat',
        reason: 'Contradictions detected - reinforcing key messages',
      };
    }

    // Very negative sentiment -> de-escalate (be more reassuring)
    if (metrics.sentiment < -0.5) {
      return {
        modifier: 'de-escalate',
        reason: 'Negative sentiment detected - adopting more reassuring tone',
      };
    }

    // Moderate negative sentiment with high evasiveness -> escalate
    if (metrics.sentiment < -0.2 && metrics.evasiveness > 0.4) {
      return {
        modifier: 'escalate',
        reason: 'Negative sentiment with evasiveness - increasing urgency',
      };
    }

    // Default to normal behavior
    return {
      modifier: 'normal',
      reason: 'Metrics within normal range',
    };
  }

  /**
   * Get adaptation strength based on metrics severity
   */
  getAdaptationStrength(metrics: SessionMetricsData): number {
    // Calculate a composite score
    const evasivenessWeight = Math.abs(metrics.evasiveness - 0.5) * 2; // Distance from neutral
    const contradictionWeight = metrics.contradiction;
    const sentimentWeight = Math.abs(metrics.sentiment);

    // Weighted average
    const strength = (evasivenessWeight * 0.4 + contradictionWeight * 0.3 + sentimentWeight * 0.3);
    return Math.min(1.0, strength);
  }
}

export const behaviorAdapter = new BehaviorAdapter();

