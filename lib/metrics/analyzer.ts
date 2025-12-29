export interface MessageMetrics {
  evasiveness: number; // 0.0-1.0
  contradiction: number; // 0.0-1.0
  sentiment: number; // -1.0 to 1.0
}

export interface SessionMetricsData {
  evasiveness: number;
  contradiction: number;
  sentiment: number;
}

export class MetricsAnalyzer {
  /**
   * Analyze a single message for evasiveness
   * Looks for patterns like: "I don't know", "I can't", "I'm not sure", vague responses
   */
  analyzeEvasiveness(message: string, userQuestion?: string): number {
    const lowerMessage = message.toLowerCase();
    const evasivePhrases = [
      "i don't know",
      "i can't",
      "i'm not sure",
      "i'm unable to",
      "i cannot",
      "that's difficult",
      "that's hard to say",
      "i'm not certain",
      "i'm not able",
      "unfortunately i",
      "i'm sorry but",
      "i don't have",
      "i don't think",
      "maybe",
      "perhaps",
      "possibly",
      "might",
      "could be",
    ];

    let evasivenessScore = 0;

    // Check for evasive phrases
    for (const phrase of evasivePhrases) {
      if (lowerMessage.includes(phrase)) {
        evasivenessScore += 0.15;
      }
    }

    // Check if response doesn't answer a direct question
    if (userQuestion) {
      const questionWords = userQuestion.toLowerCase().match(/\b(what|when|where|who|why|how|which|can|will|do|does|did|is|are|was|were)\b/g);
      if (questionWords && questionWords.length > 0) {
        // Check if response contains question words but doesn't provide an answer
        const hasQuestionWords = questionWords.some((word) => lowerMessage.includes(word));
        const isShort = message.split(/\s+/).length < 10;
        if (hasQuestionWords && isShort) {
          evasivenessScore += 0.2;
        }
      }
    }

    // Check for vague qualifiers
    const vagueWords = ["somewhat", "kind of", "sort of", "a bit", "a little", "rather", "quite"];
    for (const word of vagueWords) {
      if (lowerMessage.includes(word)) {
        evasivenessScore += 0.1;
      }
    }

    return Math.min(1.0, evasivenessScore);
  }

  /**
   * Analyze for contradictions with previous messages
   * Simple keyword-based contradiction detection
   */
  analyzeContradiction(
    currentMessage: string,
    previousMessages: Array<{ role: string; content: string }>
  ): number {
    if (previousMessages.length === 0) {
      return 0;
    }

    const lowerCurrent = currentMessage.toLowerCase();
    let contradictionScore = 0;

    // Look for explicit contradiction phrases
    const contradictionPhrases = [
      "actually",
      "but",
      "however",
      "on the other hand",
      "that's not right",
      "that's incorrect",
      "i was wrong",
      "i made a mistake",
      "correction",
      "let me correct",
    ];

    for (const phrase of contradictionPhrases) {
      if (lowerCurrent.includes(phrase)) {
        contradictionScore += 0.3;
      }
    }

    // Simple keyword matching for contradictions
    const previousContent = previousMessages
      .filter((m) => m.role === 'assistant')
      .map((m) => m.content.toLowerCase())
      .join(' ');

    // Check for opposite sentiment words
    const positiveWords = ['good', 'great', 'excellent', 'yes', 'correct', 'right', 'agree'];
    const negativeWords = ['bad', 'wrong', 'incorrect', 'no', 'disagree', 'problem', 'issue'];

    const hasPositive = positiveWords.some((word) => previousContent.includes(word));
    const hasNegative = negativeWords.some((word) => lowerCurrent.includes(word));

    if (hasPositive && hasNegative) {
      contradictionScore += 0.2;
    }

    if (hasNegative && positiveWords.some((word) => lowerCurrent.includes(word))) {
      contradictionScore += 0.2;
    }

    return Math.min(1.0, contradictionScore);
  }

  /**
   * Simple sentiment analysis using keyword matching
   * Returns -1.0 (very negative) to 1.0 (very positive)
   */
  analyzeSentiment(message: string): number {
    const lowerMessage = message.toLowerCase();

    const positiveWords = [
      'good', 'great', 'excellent', 'wonderful', 'fantastic', 'amazing', 'perfect',
      'yes', 'sure', 'absolutely', 'definitely', 'happy', 'pleased', 'glad',
      'love', 'like', 'enjoy', 'appreciate', 'thank', 'thanks', 'helpful',
      'success', 'solved', 'fixed', 'resolved', 'working', 'better', 'improved',
    ];

    const negativeWords = [
      'bad', 'terrible', 'awful', 'horrible', 'worst', 'disappointed', 'frustrated',
      'angry', 'upset', 'sad', 'unhappy', 'no', 'cannot', "can't", 'unable',
      'problem', 'issue', 'error', 'wrong', 'incorrect', 'failed', 'broken',
      'difficult', 'hard', 'challenging', 'concerned', 'worried', 'sorry',
    ];

    let sentimentScore = 0;

    // Count positive words
    for (const word of positiveWords) {
      const matches = (lowerMessage.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length;
      sentimentScore += matches * 0.1;
    }

    // Count negative words
    for (const word of negativeWords) {
      const matches = (lowerMessage.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length;
      sentimentScore -= matches * 0.1;
    }

    // Normalize to -1.0 to 1.0
    return Math.max(-1.0, Math.min(1.0, sentimentScore));
  }

  /**
   * Analyze a message and return all metrics
   */
  analyzeMessage(
    message: string,
    userQuestion?: string,
    previousMessages: Array<{ role: string; content: string }> = []
  ): MessageMetrics {
    return {
      evasiveness: this.analyzeEvasiveness(message, userQuestion),
      contradiction: this.analyzeContradiction(message, previousMessages),
      sentiment: this.analyzeSentiment(message),
    };
  }

  /**
   * Calculate session-level metrics from all messages
   */
  calculateSessionMetrics(
    messages: Array<{ role: string; content: string }>
  ): SessionMetricsData {
    const assistantMessages = messages.filter((m) => m.role === 'assistant');
    
    if (assistantMessages.length === 0) {
      return {
        evasiveness: 0,
        contradiction: 0,
        sentiment: 0,
      };
    }

    let totalEvasiveness = 0;
    let totalContradiction = 0;
    let totalSentiment = 0;

    for (let i = 0; i < assistantMessages.length; i++) {
      const message = assistantMessages[i];
      const previousMessages = assistantMessages.slice(0, i);
      
      // Find the preceding user question
      const userMessages = messages.filter((m) => m.role === 'user');
      const userIndex = messages.indexOf(message);
      const precedingUserMessage = userMessages.find((m, idx) => {
        const msgIndex = messages.indexOf(m);
        return msgIndex < userIndex && msgIndex >= userIndex - 5;
      });

      const metrics = this.analyzeMessage(
        message.content,
        precedingUserMessage?.content,
        previousMessages
      );

      totalEvasiveness += metrics.evasiveness;
      totalContradiction += metrics.contradiction;
      totalSentiment += metrics.sentiment;
    }

    return {
      evasiveness: totalEvasiveness / assistantMessages.length,
      contradiction: totalContradiction / assistantMessages.length,
      sentiment: totalSentiment / assistantMessages.length,
    };
  }
}

export const metricsAnalyzer = new MetricsAnalyzer();

