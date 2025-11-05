import { openaiClient } from '../services/openai.service.js';
import { setApiUsageCost } from '../middlewares/apiUsageTracker.middleware.js';

export const getChatResponse = async (prompt, req = null) => {
  try {
    // Validate input
    if (!prompt || !Array.isArray(prompt) || prompt.length === 0) {
      throw new Error("Invalid messages format");
    }

    // Make OpenAI API call
    const response = await openaiClient.responses.create({
      model: "gpt-4.1-mini",
      input: prompt
    });

    const inputTokenPrice = response.usage.input_tokens / 1000000 * 0.4;
    const outputTokenPrice = response.usage.output_tokens / 1000000 * 1.6;
    const totalPrice = inputTokenPrice + outputTokenPrice;

    console.log("OpenAI Chat Response: ", {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      totalPrice: totalPrice.toFixed(5)
    });

    // Track API usage if request object is provided
    if (req && req.user) {
      setApiUsageCost(req, totalPrice);
    }

    // Return the response
    return { text: response.output_text, cost: totalPrice };
  } catch (error) {
    console.error("OpenAI API Error:", error);
    throw error;
  }
}