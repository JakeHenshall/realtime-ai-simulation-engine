import { getLLMClient } from '../llm-factory';
import { LLMError } from '../llm-client';

export interface AnalysisScores {
  clarity: number; // 0-100
  accuracy: number; // 0-100
  empathy: number; // 0-100
}

export interface AnalysisResult {
  summary: string;
  scores: AnalysisScores;
  insights: {
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
  };
}

const ANALYSIS_SCHEMA = {
  type: 'object',
  required: ['summary', 'scores', 'insights'],
  properties: {
    summary: { type: 'string' },
    scores: {
      type: 'object',
      required: ['clarity', 'accuracy', 'empathy'],
      properties: {
        clarity: { type: 'number', minimum: 0, maximum: 100 },
        accuracy: { type: 'number', minimum: 0, maximum: 100 },
        empathy: { type: 'number', minimum: 0, maximum: 100 },
      },
    },
    insights: {
      type: 'object',
      required: ['strengths', 'weaknesses', 'recommendations'],
      properties: {
        strengths: { type: 'array', items: { type: 'string' } },
        weaknesses: { type: 'array', items: { type: 'string' } },
        recommendations: { type: 'array', items: { type: 'string' } },
      },
    },
  },
};

export class SessionAnalyzer {
  /**
   * Validate JSON structure matches expected schema
   */
  private validateAnalysisResult(data: any): data is AnalysisResult {
    if (!data || typeof data !== 'object') {
      return false;
    }

    if (typeof data.summary !== 'string') {
      return false;
    }

    if (!data.scores || typeof data.scores !== 'object') {
      return false;
    }

    const { clarity, accuracy, empathy } = data.scores;
    if (
      typeof clarity !== 'number' ||
      clarity < 0 ||
      clarity > 100 ||
      typeof accuracy !== 'number' ||
      accuracy < 0 ||
      accuracy > 100 ||
      typeof empathy !== 'number' ||
      empathy < 0 ||
      empathy > 100
    ) {
      return false;
    }

    if (!data.insights || typeof data.insights !== 'object') {
      return false;
    }

    const { strengths, weaknesses, recommendations } = data.insights;
    if (
      !Array.isArray(strengths) ||
      !Array.isArray(weaknesses) ||
      !Array.isArray(recommendations)
    ) {
      return false;
    }

    if (
      !strengths.every((s) => typeof s === 'string') ||
      !weaknesses.every((w) => typeof w === 'string') ||
      !recommendations.every((r) => typeof r === 'string')
    ) {
      return false;
    }

    return true;
  }

  /**
   * Analyze a session using LLM with strict JSON validation
   */
  async analyzeSession(
    messages: Array<{ role: string; content: string }>,
    sessionContext?: { name?: string; preset?: string }
  ): Promise<AnalysisResult> {
    const conversationText = messages
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join('\n\n');

    const systemPrompt = `You are an expert conversation analyst. Analyze the following conversation and provide a structured assessment.

You MUST respond with valid JSON only, following this exact structure:
{
  "summary": "A brief 2-3 sentence summary of the conversation",
  "scores": {
    "clarity": <number 0-100>, // How clear and understandable were the responses?
    "accuracy": <number 0-100>, // How accurate and correct were the responses?
    "empathy": <number 0-100>   // How empathetic and understanding were the responses?
  },
  "insights": {
    "strengths": ["strength1", "strength2", ...],
    "weaknesses": ["weakness1", "weakness2", ...],
    "recommendations": ["recommendation1", "recommendation2", ...]
  }
}

IMPORTANT:
- Respond with ONLY valid JSON, no markdown, no code blocks, no explanations
- All scores must be integers between 0 and 100
- All arrays must contain at least 2 items
- Be objective and specific in your analysis`;

    const userPrompt = `Analyze this conversation:

${conversationText}

${sessionContext ? `\nSession context: ${sessionContext.name || 'Unnamed session'}` : ''}

Provide your analysis as JSON following the exact structure specified.`;

    const llmClient = getLLMClient();

    try {
      const response = await llmClient.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3, // Lower temperature for more consistent JSON
        maxTokens: 1000,
      });

      // Extract JSON from response (handle potential markdown code blocks)
      let jsonText = response.content.trim();
      
      // Remove markdown code blocks if present
      const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }

      // Parse JSON
      let parsed: any;
      try {
        parsed = JSON.parse(jsonText);
      } catch (parseError) {
        throw new LLMError(
          `Invalid JSON response from LLM: ${parseError instanceof Error ? parseError.message : 'Parse error'}`,
          500,
          true
        );
      }

      // Validate structure
      if (!this.validateAnalysisResult(parsed)) {
        throw new LLMError(
          'LLM response does not match required schema structure',
          500,
          true
        );
      }

      return parsed;
    } catch (error) {
      if (error instanceof LLMError) {
        throw error;
      }

      throw new LLMError(
        `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        true
      );
    }
  }
}

export const sessionAnalyzer = new SessionAnalyzer();

