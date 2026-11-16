import test from 'node:test';
import assert from 'node:assert/strict';
import { completeAI, classifyOpenRouterError, DEFAULT_MODEL } from '../api/_lib/openrouter.js';

// OpenRouter remains in use by the explicit Funding Document Creator;
// the conversational Ask OPPOTRON endpoint has been retired.

test('OpenRouter errors are distinguished: insufficient credits versus provider failure', () => {
  const budget = classifyOpenRouterError(402, {error:{code:402,metadata:{error_type:'payment_required'}}});
  assert.equal(budget.status,402);
  assert.match(budget.message,/credits/i);
  const unavailable = classifyOpenRouterError(502,{error:{code:502,metadata:{error_type:'provider_unavailable'}}});
  assert.equal(unavailable.status,502);
  assert.notEqual(budget.message,unavailable.message);
});

test('OpenRouter uses a free model fallback when a selected paid model lacks credits', async () => {
  const previous = globalThis.fetch;
  const key = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'not-a-real-key-for-mocked-test';
  const used = [];
  try {
    globalThis.fetch = async (_url, options) => {
      const body=JSON.parse(options.body);
      used.push(body.model);
      if (body.model !== DEFAULT_MODEL) return {ok:false,status:402,json:async()=>({error:{code:402,message:'Insufficient credits'}})};
      return {ok:true,status:200,json:async()=>({choices:[{message:{content:'Verify the funding criteria and application deadline.'}}],model:DEFAULT_MODEL})};
    };
    const result = await completeAI({model:'openai/gpt-4o-mini',messages:[{role:'user',content:'Explain the call'}]});
    assert.deepEqual(used,['openai/gpt-4o-mini',DEFAULT_MODEL]);
    assert.equal(result.fallback,true);
    assert.match(result.answer,/Verify/);
  } finally {
    globalThis.fetch=previous;
    if (key === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY=key;
  }
});

test('OpenRouter tells administrators when the API key is missing', async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try { await assert.rejects(() => completeAI({messages:[{role:'user',content:'Hello'}]}),/OPENROUTER_API_KEY/); }
  finally { if(previous !== undefined) process.env.OPENROUTER_API_KEY=previous; }
});
