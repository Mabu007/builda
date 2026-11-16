import React, { useState } from 'react';
import {
  ArrowRight, ArrowUpRight, Bell, Bot, Building2, Check, CheckCircle2,
  ClipboardCheck, FilePenLine, FileText, FolderOpen, HeartHandshake,
  LockKeyhole, Menu, ShieldCheck, Sparkles, X
} from 'lucide-react';
import './landing.css';

type Props = { onLogin: () => void; onGetStarted: () => void; onDashboard: () => void; loggedIn: boolean };
const pillars = [
  { number: '01 / ORGANISE', title: 'Document Vault & Compliance', icon: <FolderOpen size={22}/>, description: 'Keep NPO registration, constitution, financial and programme records in one secure library. Track recorded expiry dates and build a stronger administrative foundation.', available: 'Document vault available · AI reading planned' },
  { number: '02 / DISCOVER', title: 'Funding Opportunities', icon: <HeartHandshake size={22}/>, description: 'Discover relevant grants, corporate CSI programmes, foundations and funders based on your NPO’s mission and reach. Our dedicated source integrations are the next step.', available: 'Funding discovery framework coming next' },
  { number: '03 / CREATE', title: 'AI Document Creator', icon: <FilePenLine size={22}/>, description: 'Turn your organisation knowledge into proposals, letters and applications. A beautiful Tiptap editor with PDF and Word export is planned; AI draft assistance starts in chat.', available: 'AI draft assistance available · Editor planned' },
  { number: '04 / PREPARE', title: 'Application Assistant', icon: <ClipboardCheck size={22}/>, description: 'Understand each funder’s requirements, build preparation checklists and keep control of every submission. Application tracking and authorised automation are planned.', available: 'AI checklists available · Tracking planned' }
];
const steps = [
  ['01','Create your NPO workspace','Register once and give OPPOTRON your organisation’s basic information.'],
  ['02','Tell us your mission','Add your programmes, communities served, focus area and fundraising priorities.'],
  ['03','Keep your records together','Store registration, governance and financial files securely, with useful names and dates.'],
  ['04','Prepare with an AI assistant','Ask for proposal outlines, funding application checklists and plain-language guidance.'],
  ['05','Discover the right funders','As verified funding sources are connected, see opportunities relevant to your mission.'],
  ['06','Apply with confidence','Review requirements and documents before any application is submitted.']
];

export default function Landing({ onLogin, onGetStarted, onDashboard, loggedIn }: Props) {
  const [mobileMenu,setMobileMenu] = useState(false);
  const jump = (id:string) => { setMobileMenu(false); document.getElementById(id)?.scrollIntoView({ behavior:'smooth' }); };
  const start = loggedIn ? onDashboard : onGetStarted;
  return <div className="op-landing op-npo-landing">
    <header className="op-public-header"><div className="op-public-nav">
      <button className="op-public-logo" aria-label="OPPOTRON home" onClick={() => window.scrollTo({top:0,behavior:'smooth'})}><span>o<span>.</span></span><strong>OPPOTRON</strong></button>
      <nav className={mobileMenu?'op-public-links open':'op-public-links'} aria-label="Main navigation">
        <button onClick={() => jump('platform')}>The platform</button><button onClick={() => jump('how')}>How it works</button><button onClick={() => jump('mission')}>Our mission</button>
        <div className="op-mobile-nav-actions"><button onClick={onLogin}>Log in</button><button onClick={start}>Get started <ArrowRight size={15}/></button></div>
      </nav>
      <div className="op-public-actions"><button className="op-public-login" onClick={loggedIn?onDashboard:onLogin}>{loggedIn?'Dashboard':'Log in'}</button><button className="op-public-cta" onClick={start}>{loggedIn?'Open workspace':'Get started'} <ArrowUpRight size={15}/></button></div>
      <button className="op-public-menu" aria-label={mobileMenu?'Close navigation':'Open navigation'} onClick={() => setMobileMenu(!mobileMenu)}>{mobileMenu?<X size={22}/>:<Menu size={22}/>}</button>
    </div></header>
    <main>
      <section className="op-public-hero"><div className="op-public-glow op-glow-one"/><div className="op-public-glow op-glow-two"/>
        <div className="op-public-hero-inner">
          <div className="op-public-hero-copy">
            <div className="op-public-pill"><span/> THE AI FUNDRAISING WORKSPACE FOR NONPROFITS</div>
            <h1>Your funding.<br/><em>Your documents.</em><br/>Your future.</h1>
            <p>Meet OPPOTRON — your nonprofit’s intelligent fundraising administration desk. Organise your documents, understand funding requirements and prepare better applications without needing a full-time fundraising team.</p>
            <div className="op-public-hero-actions"><button className="op-public-hero-cta" onClick={start}>Create your NPO workspace <ArrowUpRight size={18}/></button><button className="op-public-hero-secondary" onClick={() => jump('platform')}>Explore the platform <ArrowRight size={18}/></button></div>
            <div className="op-public-proof"><span><ShieldCheck size={15}/> Your records stay private</span><span><Sparkles size={15}/> AI support that knows your mission</span></div>
          </div>
          <div className="op-public-hero-art" aria-label="Illustrative OPPOTRON nonprofit fundraising workspace">
            <div className="op-preview-window">
              <div className="op-preview-top"><div className="op-preview-logo"><span>o.</span> OPPOTRON</div><div className="op-preview-top-side"><span>ILLUSTRATIVE WORKSPACE</span><Bell size={15}/><span className="op-preview-user">N</span></div></div>
              <div className="op-preview-content">
                <div className="op-preview-greeting"><span>YOUR FUNDRAISING ADMINISTRATION DESK</span><strong>Good morning.</strong><p>Your mission matters. Let’s get the paperwork organised.</p></div>
                <div className="op-npo-preview-status">
                  <div><span><Building2 size={16}/></span><strong>Organisation profile</strong><small>Your mission, programmes and funding goals</small></div>
                  <div><span><FolderOpen size={16}/></span><strong>Private documents</strong><small>Registration, constitution and records</small></div>
                </div>
                <div className="op-preview-grid">
                  <div className="op-preview-opportunities"><div className="op-preview-subhead"><strong>At your fundraising desk</strong><span>YOUR NEXT STEPS</span></div>
                    <div className="op-preview-item"><span className="op-preview-briefcase"><FileText size={17}/></span><span><strong>Review your organisation documents</strong><small>Build a reusable, private record library</small></span></div>
                    <div className="op-preview-item"><span className="op-preview-briefcase gold"><HeartHandshake size={17}/></span><span><strong>Funding opportunities</strong><small>Verified grants & CSI sources coming soon</small></span></div>
                    <div className="op-preview-item"><span className="op-preview-briefcase"><FilePenLine size={17}/></span><span><strong>Prepare a proposal outline</strong><small>Ask your OPPOTRON assistant</small></span></div>
                  </div>
                  <div className="op-preview-ai"><span><Sparkles size={17}/> YOUR AI FUNDRAISING ASSISTANT</span><strong>Big mission.<br/>Smaller admin.</strong><p>Break down complex funding requirements into clear, manageable steps.</p><div><CheckCircle2 size={16}/> You stay in control</div></div>
                </div>
              </div>
            </div>
            <div className="op-hero-orbit"><Sparkles size={19}/><span>YOUR MISSION. OUR FOCUS.</span></div>
          </div>
        </div>
      </section>
      <section className="op-public-what" id="platform"><div className="op-section-top">
        <div className="op-section-eyebrow"><span/> THE FOUR PILLARS OF OPPOTRON</div>
        <h2>Fundraising admin,<br/><em>beautifully simplified.</em></h2>
        <p>We’re building more than a grant directory. OPPOTRON connects your organisation’s documents, knowledge and fundraising work in one beautiful place.</p>
      </div>
      <div className="op-feature-grid op-npo-four-features">{pillars.map(p=><article key={p.number}>
        <div className="op-feature-symbol">{p.icon}</div><span>{p.number}</span><h3>{p.title}</h3><p>{p.description}</p><div className="op-feature-progress">{p.available}</div>
      </article>)}</div>
      </section>
      <section className="op-public-audience" id="mission"><div className="op-audience-head">
        <div className="op-section-eyebrow"><span/> BUILT FOR NONPROFITS</div>
        <h2>Small organisations.<br/><em>Extraordinary missions.</em></h2>
      </div>
      <div className="op-audience-grid">
        <div className="op-audience-card business"><span className="op-audience-icon"><HeartHandshake size={24}/></span><div className="op-audience-number">THE ORGANISATIONS WE SERVE</div><h3>For the people doing the work.</h3><p>Community NPOs, youth organisations, education programmes, healthcare charities, environmental initiatives and every small team carrying a big cause.</p><div className="op-audience-tags"><span>Education</span><span>Youth</span><span>Healthcare</span><span>Community</span><span>Environment</span></div></div>
        <div className="op-audience-card nonprofit"><span className="op-audience-icon"><LockKeyhole size={24}/></span><div className="op-audience-number">THE KNOWLEDGE BEHIND THE WORK</div><h3>Tell OPPOTRON once.</h3><p>Your organisation profile is the home for your mission, activities, registration details and funding priorities. As we add document understanding, you won’t need to keep explaining who you are.</p><div className="op-audience-tags"><span>One NPO profile</span><span>Private document vault</span><span>Reusable context</span></div></div>
      </div></section>
      <section className="op-public-workflow" id="how"><div className="op-workflow-inner">
        <div className="op-section-eyebrow light"><span/> A SIMPLER FUNDRAISING WORKFLOW</div>
        <div className="op-workflow-header"><h2>One organisation profile.<br/><em>A world of possibility.</em></h2><p>Get organised now and grow with OPPOTRON as its funding intelligence tools expand.</p></div>
        <div className="op-workflow-grid">{steps.map(([number,title,body])=><div className="op-workflow-step" key={number}><span>{number}</span><strong>{title}</strong><p>{body}</p></div>)}</div>
      </div></section>
      <section className="op-public-assistant">
        <div className="op-assistant-copy"><div className="op-section-eyebrow"><span/> YOUR AI FUNDRAISING ADMINISTRATOR</div><h2>Complicated funding calls.<br/><em>Clear next steps.</em></h2><p>Ask questions, make sense of unfamiliar funder requirements and draft a starting point for proposals. OPPOTRON uses the NPO information you’ve supplied — and asks when facts are missing.</p>
          <div className="op-assistant-points"><div><Check size={17}/> Understand grant and CSI requirements</div><div><Check size={17}/> Prepare proposals without invented figures</div><div><Check size={17}/> Keep conversations in your private workspace</div></div>
          <button onClick={start}>Meet your fundraising assistant <ArrowUpRight size={17}/></button>
        </div>
        <div className="op-assistant-mock"><div className="op-assistant-mock-top"><span><Bot size={19}/> OPPOTRON Assistant</span><small>EXAMPLE CONVERSATION</small></div>
          <div className="op-mock-user">Can you help us write a funding proposal for our youth programme?</div>
          <div className="op-mock-answer"><span><Sparkles size={15}/> OPPOTRON</span><p>Absolutely. I can outline the proposal using your organisation’s mission and programme details. We’ll leave your requested budget and impact figures clearly marked until you verify them.</p><div>First: what would the funding help your programme achieve?</div></div>
          <div className="op-mock-input">Ask about funding or applications… <ArrowRight size={17}/></div>
        </div>
      </section>
      <section className="op-public-bottom-cta"><div className="op-section-eyebrow light"><span/> YOUR FUNDING. YOUR DOCUMENTS. YOUR FUTURE.</div>
        <h2>Your mission deserves<br/><em>a stronger back office.</em></h2>
        <p>OPPOTRON is becoming the AI fundraising administration workspace for nonprofits — starting with your organisation profile, secure documents and AI assistance.</p>
        <button onClick={start}>Create your nonprofit workspace <ArrowUpRight size={18}/></button>
        <small>Available now: NPO profiles, private document vault and AI chat assistance. Dedicated grant sources, Tiptap editing, OCR and application tracking are in development.</small>
      </section>
    </main>
    <footer className="op-public-footer"><div><div className="op-public-logo footer-logo"><span>o<span>.</span></span><strong>OPPOTRON</strong></div><p>Your funding. Your documents. Your future.</p></div>
      <div><strong>EXPLORE</strong><button onClick={() => jump('platform')}>The platform</button><button onClick={() => jump('how')}>How it works</button><button onClick={() => jump('mission')}>Our mission</button></div>
      <div><strong>YOUR ACCOUNT</strong><button onClick={onLogin}>Log in</button><button onClick={start}>Create a workspace</button></div>
      <div className="op-footer-end"><span>© {new Date().getFullYear()} OPPOTRON</span><span>Built for nonprofits in South Africa.</span></div>
    </footer>
  </div>;
}
