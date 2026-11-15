/**
 * Centralised OpenRouter chat client. Deliberately does not log prompts or
 * business records. A user-selected paid model may fall back to openrouter/free
 * if billing/provider availability fails; never auto-fallback to a paid model.
 */
export const DEFAULT_MODEL = 'openrouter/free';
export function classifyOpenRouterError(status, raw = {}) {
  const type = String(raw?.error?.metadata?.error_type || raw?.error?.code || '');
  const messages = {
    400: 'The selected model rejected this request. Try another model in Settings.',
    401: 'The AI service API key is invalid. An administrator needs to update the OpenRouter key.',
    402: 'The AI service has insufficient credits. Select the Free auto model or add OpenRouter credits.',
    403: 'The AI provider refused the request or the API key lacks permission.',
    404: 'This AI model is no longer available. Choose another model.',
    408: 'The AI provider timed out. Please try again.',
    429: 'The AI provider is rate-limited. Please retry later.',
    502: 'The AI provider is unavailable. Try again or choose another model.',
    503: 'No AI model provider is available right now. Try again shortly.'
  };
  const code = Number(status || raw?.error?.code || 502);
  return { status: code === 402 ? 402 : code === 401 || code === 403 ? 503 : code === 429 ? 429 : code === 400 ? 400 : code === 408 ? 504 : 502,
    code: type || 'provider_error', upstreamStatus: code, message: messages[code] || 'AI could not respond. Please retry shortly.' };
}
function extractContent(data) {
  const raw = data?.choices?.[0]?.message?.content;
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw)) return raw.map(p => typeof p?.text === 'string' ? p.text : '').join('').trim();
  return '';
}
export async function completeAI({ model = DEFAULT_MODEL, messages, maxTokens = 900 }) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw Object.assign(new Error('The AI service is not configured. Add OPENROUTER_API_KEY in Vercel project settings.'), { status: 503, code: 'missing_key' });
  }
  const choices = model === DEFAULT_MODEL ? [DEFAULT_MODEL] : [model, DEFAULT_MODEL];
  let lastError;
  for (let i = 0; i < choices.length; i++) {
    const chosen = choices[i];
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', signal: AbortSignal.timeout(35000),
        headers: {
          Authorization: 'Bearer ' + process.env.OPENROUTER_API_KEY,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://builda-five.vercel.app/',
          'X-Title': 'OPPOTRON'
        },
        body: JSON.stringify({ model: chosen, messages, max_tokens: maxTokens, temperature: 0.25 })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.error || result?.choices?.[0]?.error) {
        const failed = classifyOpenRouterError(response.ok ? result?.error?.code || result?.choices?.[0]?.error?.code || 502 : response.status, result.error ? result : { error: result?.choices?.[0]?.error });
        console.error('OPPOTRON OpenRouter request failed', { status: failed.upstreamStatus, type: failed.code, model: chosen });
        throw Object.assign(new Error(failed.message), { status: failed.status, code: failed.code, upstreamStatus: failed.upstreamStatus });
      }
      const content = extractContent(result);
      if (!content) throw Object.assign(new Error('The AI provider returned an empty response. Retry the request.'), { status: 502, code: 'empty_response', upstreamStatus: 502 });
      return { answer: content.slice(0, 12000), model: result.model || chosen, fallback: chosen !== model };
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        lastError = Object.assign(new Error('The AI provider took too long to respond. Please retry.'), { status: 504, code: 'timeout', upstreamStatus: 408 });
      } else lastError = error;
      if (i === choices.length - 1 || [401, 403].includes(Number(lastError?.upstreamStatus)) || lastError?.code === 'missing_key') break;
    }
  }
  throw lastError || Object.assign(new Error('AI is temporarily unavailable.'), { status: 502 });
}

export function respondAIError(res, error) {
  const safeCodes = new Set(['missing_key','timeout','empty_response','provider_error','budget_exhausted','rate_limit_exceeded','payment_required','provider_unavailable','provider_overloaded','invalid_model','invalid_request','key_invalid','unauthorized','forbidden']);
  if (safeCodes.has(String(error?.code)) || Number(error?.upstreamStatus)) {
    return res.status(Number(error.status) || 502).json({ error: String(error.message).slice(0, 240), code: String(error.code || 'provider_error').slice(0, 80) });
  }
  const status = Number(error?.status);
  return res.status([400,401,429].includes(status) ? status : 500).json({ error: [400,401,429].includes(status) ? String(error.message).slice(0, 240) : 'The AI service is temporarily unavailable.' });
}
