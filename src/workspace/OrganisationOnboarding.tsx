import React, { useState } from 'react';
import { ArrowRight, Building2, Check, HeartHandshake, LockKeyhole, Sparkles } from 'lucide-react';
import './onboarding.css';

export type OrganisationType = 'business' | 'npo';
type Props = { onChoose: (type: OrganisationType) => Promise<void>; initial?: OrganisationType | null };
export default function OrganisationOnboarding({ onChoose, initial }: Props) {
  const [selected, setSelected] = useState<OrganisationType | null>(initial || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirm = async () => {
    if (!selected || busy) return;
    setBusy(true); setError('');
    try { await onChoose(selected); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save your organisation type. Check your connection.'); }
    finally { setBusy(false); }
  };
  return <div className="op-onboarding-backdrop">
    <section className="op-onboarding" role="dialog" aria-modal="true" aria-labelledby="op-choose-title">
      <div className="op-onboarding-symbol"><Sparkles size={27}/></div>
      <div className="op-onboarding-kicker">WELCOME TO OPPOTRON</div>
      <h2 id="op-choose-title">Tell us about your organisation.</h2>
      <p>We'll tailor your workspace, recommended opportunities and AI assistance to what you do. You can update your details later.</p>
      <div className="op-organisation-options">
        <button className={'op-organisation-choice ' + (selected === 'business' ? 'active' : '')} onClick={() => setSelected('business')} aria-pressed={selected === 'business'}>
          <span className="op-organisation-choice-icon"><Building2 size={24}/></span>
          <strong>Private company</strong><small>Find tenders, RFQs and procurement opportunities suited to your business.</small>
          <span className="op-organisation-selected">{selected === 'business' ? <Check size={16}/> : null}</span>
        </button>
        <button className={'op-organisation-choice ' + (selected === 'npo' ? 'active' : '')} onClick={() => setSelected('npo')} aria-pressed={selected === 'npo'}>
          <span className="op-organisation-choice-icon"><HeartHandshake size={24}/></span>
          <strong>Nonprofit / NPO</strong><small>Get help understanding grants, CSI calls, donor requirements and funding readiness.</small>
          <span className="op-organisation-selected">{selected === 'npo' ? <Check size={16}/> : null}</span>
        </button>
      </div>
      {error && <div className="op-onboarding-error" role="alert">{error}</div>}
      <button disabled={!selected || busy} className="op-onboarding-continue" onClick={() => void confirm()}>{busy ? 'Setting up your workspace…' : 'Continue to your workspace'}<ArrowRight size={17}/></button>
      <div className="op-onboarding-note"><LockKeyhole size={14}/> Your organisation profile is private. Opportunity ranking improves as you add information.</div>
    </section>
  </div>;
}
