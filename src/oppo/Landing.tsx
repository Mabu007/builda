import React, { useState } from 'react';
import {
  ArrowRight, ArrowUpRight, Bell, Bot, BriefcaseBusiness, Building2, Check, CheckCircle2,
  ChevronRight, CircleCheck, FileCheck2, FileText, FolderOpen, HeartHandshake, LockKeyhole,
  Menu, Search, ShieldCheck, Sparkles, X
} from 'lucide-react';
import './landing.css';

type Props = { onLogin: () => void; onGetStarted: () => void; onDashboard: () => void; loggedIn: boolean };
const steps = [
  ['01', 'Build your organisation profile', 'Tell OPPOTRON what you do, your sector, capabilities and where you operate.'],
  ['02', 'Store documents securely', 'Keep registration, compliance and supporting documents in one private vault.'],
  ['03', 'Understand your organisation', 'As you add detail, improve readiness insights and opportunity matching.'],
  ['04', 'Discover relevant opportunities', 'Surface public procurement opportunities matched to your organisation. CSI and grant ingestion is on the roadmap.'],
  ['05', 'Decode and prepare', 'Let the assistant translate complex requirements into clear actions, checklists and drafts.'],
  ['06', 'Review before applying', 'Keep decisions and final submissions under your organisation’s control.']
];
export default function Landing({ onLogin, onGetStarted, onDashboard, loggedIn }: Props) {
  const [mobileMenu, setMobileMenu] = useState(false);
  const jump = (id: string) => { setMobileMenu(false); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); };
  return <div className="op-landing">
    <header className="op-public-header">
      <div className="op-public-nav">
        <button className="op-public-logo" onClick={() => window.scrollTo({ top: 0, behavior:'smooth' })} aria-label="OPPOTRON home"><span>o<span>.</span></span><strong>OPPOTRON</strong></button>
        <nav className={mobileMenu ? 'op-public-links open' : 'op-public-links'} aria-label="Main navigation">
          <button onClick={() => jump('platform')}>Platform</button><button onClick={() => jump('how')}>How it works</button><button onClick={() => jump('audience')}>For organisations</button>
          <div className="op-mobile-nav-actions"><button onClick={onLogin}>Log in</button><button onClick={loggedIn ? onDashboard : onGetStarted}>Get started <ArrowRight size={15}/></button></div>
        </nav>
        <div className="op-public-actions"><button className="op-public-login" onClick={loggedIn ? onDashboard : onLogin}>{loggedIn ? 'Dashboard' : 'Log in'}</button><button className="op-public-cta" onClick={loggedIn ? onDashboard : onGetStarted}>{loggedIn ? 'Open workspace' : 'Get started'} <ArrowUpRight size={15}/></button></div>
        <button className="op-public-menu" aria-label={mobileMenu ? 'Close menu' : 'Open menu'} onClick={() => setMobileMenu(!mobileMenu)}>{mobileMenu ? <X size={22}/> : <Menu size={22}/>}</button>
      </div>
    </header>
    <main>
      <section className="op-public-hero">
        <div className="op-public-glow op-glow-one"/><div className="op-public-glow op-glow-two"/>
        <div className="op-public-hero-inner">
          <div className="op-public-hero-copy">
            <div className="op-public-pill"><span/> YOUR OPPORTUNITY INTELLIGENCE DEPARTMENT</div>
            <h1>Your business.<br/><em>The right opportunities.</em><br/>Automatically.</h1>
            <p>OPPOTRON brings opportunity discovery, document management and an AI administration assistant into one beautiful workspace — built for businesses and nonprofit organisations.</p>
            <div className="op-public-hero-actions"><button onClick={loggedIn ? onDashboard : onGetStarted} className="op-public-hero-cta">Start with OPPOTRON <ArrowUpRight size={18}/></button><button onClick={() => jump('platform')} className="op-public-hero-secondary">Explore the platform <ArrowRight size={18}/></button></div>
            <div className="op-public-proof"><span><ShieldCheck size={15}/> Private organisation workspace</span><span><Sparkles size={15}/> AI-assisted opportunity research</span></div>
          </div>
          <div className="op-public-hero-art" aria-label="Illustrative OPPOTRON organisation dashboard preview">
            <div className="op-preview-window">
              <div className="op-preview-top"><div className="op-preview-logo"><span>o.</span> OPPOTRON</div><div className="op-preview-top-side"><span>ILLUSTRATIVE PREVIEW</span><Bell size={15}/><span className="op-preview-user">O</span></div></div>
              <div className="op-preview-content"><div className="op-preview-greeting"><span>YOUR OPPORTUNITY INTELLIGENCE</span><strong>Good morning.</strong><p>Your next opportunity, made clearer.</p></div>
              <div className="op-preview-metrics"><div><span>Potential matches</span><strong>12</strong><small>Example count</small></div><div><span>Priority reviews</span><strong>03</strong><small>Example count</small></div><div><span>Profile readiness</span><strong>85%</strong><small>Illustrative</small></div></div>
              <div className="op-preview-grid"><div className="op-preview-opportunities"><div className="op-preview-subhead"><strong>Recommended for you</strong><span>BASED ON YOUR PROFILE</span></div><div className="op-preview-item"><span className="op-preview-briefcase"><BriefcaseBusiness size={17}/></span><span><strong>Infrastructure maintenance contract</strong><small>Public procurement · Example</small></span><i>Strong fit</i></div><div className="op-preview-item"><span className="op-preview-briefcase gold"><HeartHandshake size={17}/></span><span><strong>Community development grant</strong><small>Corporate CSI · Future source</small></span><i>Illustrative</i></div></div><div className="op-preview-ai"><span><Sparkles size={17}/> YOUR AI BRIEFING</span><strong>Less searching.<br/>More clarity.</strong><p>Opportunity requirements, organised into practical next steps.</p><div><CheckCircle2 size={16}/> Human approval required</div></div></div>
            </div>
            </div>
            <div className="op-hero-orbit"><Sparkles size={19}/><span>INTELLIGENCE, NOT INFORMATION OVERLOAD</span></div>
          </div>
        </div>
      </section>
      <section className="op-public-what" id="platform">
        <div className="op-section-top"><div className="op-section-eyebrow"><span/> THE OPPOTRON PLATFORM</div><h2>Not another directory.<br/><em>Your opportunity operations desk.</em></h2><p>Stop searching dozens of portals and decoding lengthy requirements alone. OPPOTRON helps organise your information, find possible matches and understand what to do next.</p></div>
        <div className="op-feature-grid">
          <article><div className="op-feature-symbol"><Search size={22}/></div><span>01 / DISCOVER</span><h3>Relevant opportunity intelligence</h3><p>Find and shortlist public tenders from the live feed, matched to your services and coverage. Grant and CSI feeds will expand over time.</p></article>
          <article><div className="op-feature-symbol"><FolderOpen size={22}/></div><span>02 / ORGANISE</span><h3>One intelligent document home</h3><p>Store company or NPO documents privately, attach meaningful metadata and keep track of expiry dates in a clean library.</p></article>
          <article><div className="op-feature-symbol"><Bot size={22}/></div><span>03 / UNDERSTAND</span><h3>Your AI admin assistant</h3><p>Chat with OPPOTRON to decode tender conditions, CSI calls, application language and supporting document requirements.</p></article>
        </div>
      </section>
      <section className="op-public-audience" id="audience">
        <div className="op-audience-head"><div className="op-section-eyebrow"><span/> BUILT FOR YOUR ORGANISATION</div><h2>Different missions.<br/><em>One intelligent workspace.</em></h2></div>
        <div className="op-audience-grid">
          <div className="op-audience-card business"><span className="op-audience-icon"><Building2 size={24}/></span><div className="op-audience-number">01 / COMPANIES</div><h3>For businesses & contractors.</h3><p>Explore tenders and procurement notices, keep company documents organised and uncover where you may be a good fit.</p><div className="op-audience-tags"><span>Construction</span><span>IT</span><span>Cleaning</span><span>Logistics</span><span>Professional services</span></div></div>
          <div className="op-audience-card nonprofit"><span className="op-audience-icon"><HeartHandshake size={24}/></span><div className="op-audience-number">02 / NONPROFITS</div><h3>For NPOs & organisations.</h3><p>Organise registration and impact information, discuss CSI and grant requirements, and prepare for future funding-discovery feeds.</p><div className="op-audience-tags"><span>Education</span><span>Youth</span><span>Healthcare</span><span>Community</span><span>Environment</span></div></div>
        </div>
      </section>
      <section className="op-public-workflow" id="how"><div className="op-workflow-inner">
        <div className="op-section-eyebrow light"><span/> FROM PROFILE TO POSSIBILITY</div>
        <div className="op-workflow-header"><h2>Give OPPOTRON the context.<br/><em>Keep control of the decisions.</em></h2><p>One connected workflow for discovering, understanding and preparing for opportunities.</p></div>
        <div className="op-workflow-grid">{steps.map(([number,title,body])=><div className="op-workflow-step" key={number}><span>{number}</span><strong>{title}</strong><p>{body}</p></div>)}</div>
      </div></section>
      <section className="op-public-assistant">
        <div className="op-assistant-copy"><div className="op-section-eyebrow"><span/> MEET YOUR NEW ADMIN ASSISTANT</div><h2>Complex requirements.<br/><em>Clear answers.</em></h2><p>Ask questions about a notice, explore eligibility language, prepare a checklist or understand what an application is really asking for.</p><div className="op-assistant-points"><div><Check size={17}/> Context from your organisation profile</div><div><Check size={17}/> Private chat history in your workspace</div><div><Check size={17}/> Source-aware explanations, not guesses</div></div><button onClick={loggedIn ? onDashboard : onGetStarted}>Meet your assistant <ArrowUpRight size={17}/></button></div>
        <div className="op-assistant-mock"><div className="op-assistant-mock-top"><span><Bot size={19}/> OPPOTRON Assistant</span><small>EXAMPLE CONVERSATION</small></div><div className="op-mock-user">What does “mandatory briefing” mean for this tender?</div><div className="op-mock-answer"><span><Sparkles size={15}/> OPPOTRON</span><p>It means the buyer may require you to attend a specified briefing session. Check the original tender for the date, location and whether attendance is an eligibility condition.</p><div>Next step: verify the briefing details in the official notice.</div></div><div className="op-mock-input">Ask OPPOTRON anything… <ArrowRight size={17}/></div></div>
      </section>
      <section className="op-public-bottom-cta"><div className="op-section-eyebrow light"><span/> OPPORTUNITY INTELLIGENCE · POWERED BY AI</div><h2>Your organisation deserves<br/><em>a smarter way forward.</em></h2><p>Build your profile once. Put your documents in order. Start finding and understanding opportunities that matter.</p><button onClick={loggedIn ? onDashboard : onGetStarted}>Create your OPPOTRON workspace <ArrowUpRight size={18}/></button><small>Now available: organisation profiles, document vault, public tenders and AI assistance. CSI/grant ingestion and automated applications are planned.</small></section>
    </main>
    <footer className="op-public-footer"><div><div className="op-public-logo footer-logo"><span>o<span>.</span></span><strong>OPPOTRON</strong></div><p>Opportunity Intelligence. Powered by AI.</p></div><div><strong>PLATFORM</strong><button onClick={() => jump('platform')}>Features</button><button onClick={() => jump('how')}>How it works</button><button onClick={() => jump('audience')}>Who it's for</button></div><div><strong>YOUR WORKSPACE</strong><button onClick={onLogin}>Log in</button><button onClick={loggedIn ? onDashboard : onGetStarted}>Get started</button></div><div className="op-footer-end"><span>© {new Date().getFullYear()} OPPOTRON</span><span>Built for opportunity in South Africa.</span></div></footer>
  </div>;
}
