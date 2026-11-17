import React,{useEffect,useRef,useState} from 'react';
import type {User} from 'firebase/auth';
import {signOut} from 'firebase/auth';
import {
 ArrowDownToLine,ArrowLeft,ArrowRight,ArrowUpRight,Bell,BookOpenText,Check,
 CheckCircle2,ChevronRight,ClipboardCheck,Clock3,CloudDownload,Compass,Edit3,
 ExternalLink,FileText,Filter,FolderOpen,HeartHandshake,LayoutDashboard,Link2,
 LockKeyhole,LogOut,Menu,Plus,RefreshCw,Search,Settings2,ShieldCheck,Sparkles,
 Trash2,Users,Building2,Mail,Phone,X
} from 'lucide-react';
import {auth} from '../firebase';
import {FUNDING_PROFILE_FIELDS,type FundingOpportunity} from '../workspace/funding';
import './admin.css';
type Section='overview'|'users'|'npos'|'funders'|'opportunities'|'discovery';
type UserRecord={uid:string;email:string;createdAt:string;lastLoginAt:string;disabled:boolean;organisation:Record<string,unknown>|null};
type Candidate={id:string;jobId:string;sourceUrl:string;title:string;data:Partial<FundingOpportunity>|null;duplicateOf:string;status:string;notice?:string;error?:string;extractedAt:string;importedOpportunityId?:string};
type Job={id:string;mode:string;query:string;sourceUrl:string;status:string;urls:{url:string}[];cursor:number;provider?:string;fallback?:boolean;providerNotice?:string;errors:{message:string}[];createdAt:string};
type Summary={totalUsers:number|null;organisations:number;totalOpportunities:number;published:number;active:number;pendingReviews:number;discoveryJobs:number;discoveryRunning:number;partial?:boolean};
type AdminData={items:FundingOpportunity[];hasMore:boolean};
type FunderRecord={id?:string;name:string;website?:string;contactEmail?:string;contactPhone?:string;description?:string;notes?:string;published?:boolean;sectors?:string[];fundingTypes?:string[];researchStatuses?:string[];sourceUrls?:string[];researchLeadCount?:number;researchLastCheckedAt?:string;geography?:string};
type ResearchPreview={leads:number;funders:number;explicitlyOpen:number;uncertain:number;imported:number;checkedAt:string;warning:string};
type ImportProgress={processed:number;total:number;created:number;skipped:number;errors:string[]};
const blankFunder:FunderRecord={name:'',website:'',contactEmail:'',contactPhone:'',description:'',notes:'',published:false};
const npoProgress=(record:UserRecord)=>FUNDING_PROFILE_FIELDS.filter(key=>String(record.organisation?.[key]||'').trim()).length*10;
type Props={user:User;onExit:()=>void;onWorkspace:()=>void};
type Editor={
 id:string;title:string;funder:string;description:string;sector:string;eligibility:string;
 registration:string;coverage:string;amount:string;deadline:string;round:string;
 applicationUrl:string;sourceUrl:string;contactEmail:string;contactPhone:string;applicationInstructions:string;requirementsText:string;documentsText:string;
 verificationStatus:string;status:string;notes:string;
};
const emptyEditor:Editor={
 id:'',title:'',funder:'',description:'',sector:'General',eligibility:'',registration:'',
 coverage:'',amount:'',deadline:'',round:'',applicationUrl:'',sourceUrl:'',contactEmail:'',contactPhone:'',applicationInstructions:'',
 requirementsText:'',documentsText:'',verificationStatus:'unverified',status:'draft',notes:''
};
const sectors=['Education','Youth development','Healthcare','Community development','Food security','Environment','Women empowerment','Disability inclusion','Arts and culture','Sports','Economic empowerment','Human rights','General','Other'];
const sections:{id:Section;label:string;icon:React.ReactNode}[]=[
 {id:'overview',label:'Overview',icon:<LayoutDashboard size={18}/>},
 {id:'users',label:'Users',icon:<Users size={18}/>},
  {id:'npos',label:'NPOs',icon:<Building2 size={18}/>},
  {id:'funders',label:'Funders',icon:<HeartHandshake size={18}/>},
 {id:'opportunities',label:'Opportunities',icon:<HeartHandshake size={18}/>},
 {id:'discovery',label:'Discovery Engine',icon:<Compass size={18}/>}
];
const initialEditor=(op:Partial<FundingOpportunity>={}):Editor=>({
 ...emptyEditor,...Object.fromEntries(Object.entries(op).filter(([,v])=>typeof v==='string')),
 id:op.id||'',requirementsText:(op.requirements||[]).join('\n'),
 documentsText:(op.documents||[]).map(d=>(d.title||'Document')+' | '+(d.sourceUrl||'')).join('\n'),
 verificationStatus:op.verificationStatus||'unverified',status:op.status||'draft'
});
function toRecord(edit:Editor){
 return {...edit,requirements:edit.requirementsText.split('\n').map(x=>x.trim()).filter(Boolean),
  documents:edit.documentsText.split('\n').map(row=>{const [title,...rest]=row.split('|');return{title:title?.trim()||'Document',sourceUrl:rest.join('|').trim()};}).filter(doc=>doc.sourceUrl),
  amount:edit.amount,source:'manual',verificationStatus:edit.verificationStatus,status:edit.status};
}
async function adminApi<T>(user:User,action:string,body?:unknown):Promise<T>{
 const token=await user.getIdToken();
 const response=await fetch('/api/admin?action='+encodeURIComponent(action),{
  method:body===undefined?'GET':'POST',
  headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},
  ...(body===undefined?{}:{body:JSON.stringify(body)})
 });
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw Object.assign(new Error(String(result.error||'Admin request failed.')),{status:response.status});
 return result as T;
}
const dateText=(d?:string)=>{if(!d)return 'Not recorded';const date=new Date(d);return Number.isNaN(date.getTime())?'Not recorded':date.toLocaleString('en-ZA',{dateStyle:'medium'});};
export default function AdminDashboard({user,onExit,onWorkspace}:Props){
 const [access,setAccess]=useState<'checking'|'allowed'|'denied'|'failed'>('checking');
 const [section,setSection]=useState<Section>('overview'),[navOpen,setNavOpen]=useState(false);
 const [summary,setSummary]=useState<Summary|null>(null),[users,setUsers]=useState<UserRecord[]>([]),[usersWarning,setUsersWarning]=useState('');
 const [opportunities,setOpportunities]=useState<FundingOpportunity[]>([]),[candidates,setCandidates]=useState<Candidate[]>([]),[jobs,setJobs]=useState<Job[]>([]);
 const [funders,setFunders]=useState<FunderRecord[]>([]),[funderSearch,setFunderSearch]=useState(''),[funderEditor,setFunderEditor]=useState<FunderRecord|null>(null);
 const [researchPreview,setResearchPreview]=useState<ResearchPreview|null>(null),[seedBusy,setSeedBusy]=useState(false),[importProgress,setImportProgress]=useState<ImportProgress|null>(null);
 const autoSeedStarted=useRef(false);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [search,setSearch]=useState(''),[filter,setFilter]=useState('all');
 const [userSearch,setUserSearch]=useState(''),[selectedUser,setSelectedUser]=useState<UserRecord|null>(null),[hasMoreOpportunities,setHasMoreOpportunities]=useState(false);
 const [editor,setEditor]=useState<Editor|null>(null),[candidateEdit,setCandidateEdit]=useState<Candidate|null>(null);
 const [prompt,setPrompt]=useState('Find open CSI, grant and foundation funding opportunities for South African nonprofit organisations.');
 const [limit,setLimit]=useState(20),[url,setUrl]=useState(''),[discoverMode,setDiscoverMode]=useState<'search'|'url'>('search');
 const [jobActive,setJobActive]=useState(''),[jobBusy,setJobBusy]=useState(false);
 const [probeBusy,setProbeBusy]=useState(false),[providerResults,setProviderResults]=useState<{firecrawl?:{ok:boolean;message:string};tavily?:{ok:boolean;message:string}}|null>(null);
 const jobLock=useRef(false),loaded=useRef(false);
 const check=async()=>{
  setAccess('checking');
  try{
   await user.getIdToken(true);
   const res=await adminApi<{admin:boolean}>(user,'session');
   setAccess(res.admin?'allowed':'denied');
  }catch(error){setAccess([401,403].includes(Number((error as {status?:number}).status))?'denied':'failed');}
 };
 useEffect(()=>{void check();},[user.uid]);
 const fetchSection=async(next:Section)=>{
  setLoading(true);setError('');
  try{
   if(next==='overview')setSummary(await adminApi<Summary>(user,'overview'));
   if(next==='users'||next==='npos'){const data=await adminApi<{items:UserRecord[];warning:string}>(user,'users');setUsers(data.items||[]);setUsersWarning(data.warning||'');}
    if(next==='funders'){const [data,preview]=await Promise.all([
      adminApi<{items:FunderRecord[]}>(user,'funders'),
      adminApi<ResearchPreview>(user,'research-preview')]);
      setFunders(data.items||[]);setResearchPreview(preview);
    }
   if(next==='opportunities'){const data=await adminApi<AdminData>(user,'opportunities');setOpportunities(data.items||[]);setHasMoreOpportunities(Boolean(data.hasMore));}
   if(next==='discovery'){
    const [a,b]=await Promise.all([adminApi<{items:Candidate[]}>(user,'candidates'),adminApi<{items:Job[]}>(user,'jobs')]);
    setCandidates(a.items||[]);const sorted=(b.items||[]).sort((x,y)=>y.createdAt.localeCompare(x.createdAt));setJobs(sorted);
     const pending=sorted.find(job=>!['done','failed'].includes(job.status));
     if(pending)setJobActive(current=>current||pending.id);
   }
  }catch(e){setError(e instanceof Error?e.message:'Unable to load admin records.');}finally{setLoading(false);}
 };
 useEffect(()=>{if(access==='allowed')void fetchSection(section);},[access,section]);
 const go=(s:Section)=>{setSection(s);setNavOpen(false);setNotice('');setError('');};
 const refresh=()=>void fetchSection(section);
 const action=async(kind:string,data:unknown,after?:()=>void)=>{
  if(busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   await adminApi(user,kind,data);after?.();
   setNotice(kind==='delete'?'Opportunity deleted.':kind==='discard'?'Candidate discarded.':kind==='store-pdfs'?'Source PDF processing completed.':kind==='reverify'?'Reverification candidate created for review.':'Saved to the shared funding database.');
   if(['import','discard','reverify'].includes(kind)){if(kind==='reverify')setSection('discovery');await fetchSection('discovery');}
    else {if(kind==='store-pdfs'){setEditor(null);setCandidateEdit(null);}await fetchSection('opportunities');}
  }catch(e){setError(e instanceof Error?e.message:'Action failed.');}
  finally{setBusy(false);}
 };
 const submitEditor=async(e:React.FormEvent)=>{
  e.preventDefault();if(!editor)return;
  const input=toRecord(editor);
  if(candidateEdit){
   await action('import',{id:candidateEdit.id,overrides:input},()=>{setCandidateEdit(null);setEditor(null);});
  }else await action(editor.id?'update':'create',input,()=>setEditor(null));
 };
 const remove=async(op:FundingOpportunity)=>{
  if(!confirm('Permanently delete "'+op.title+'"? This cannot be undone.'))return;
  await action('delete',{id:op.id});
 };
 const status=async(op:FundingOpportunity,value:'published'|'draft'|'archived')=>{
  await action('update',{id:op.id,status:value});
 };
 const probe=async()=>{
  setProbeBusy(true);setProviderResults(null);setError('');
  try{setProviderResults(await adminApi(user,'probe-providers'));}
  catch(error){setError(error instanceof Error?error.message:'Provider check could not be completed.');}
  finally{setProbeBusy(false);}
 };
 const begin=async()=>{
  if(busy||jobBusy)return;
  if(discoverMode==='search'&&prompt.trim().length<8){setError('Enter at least 8 characters to describe the funding search.');return;}
   if(discoverMode==='url'&&!/^https:\/\//i.test(url.trim())){setError('Enter a public HTTPS funding-source URL.');return;}
   setBusy(true);setError('');setNotice('');
  try{
   const result=await adminApi<Job>(user,'start',{mode:discoverMode,query:prompt,url,limit});
   setJobActive(result.id);setNotice('Discovery job queued. Results will appear in the review queue.');setSection('discovery');
   await fetchSection('discovery');
  }catch(e){setError(e instanceof Error?e.message:'Could not start discovery.');}
  finally{setBusy(false);}
 };
 const advance=async(id:string)=>{
  if(jobLock.current||!id)return;
  jobLock.current=true;setJobBusy(true);
  try{
   const result=await adminApi<Job>(user,'tick',{id});
   const [queue,updatedJobs]=await Promise.all([adminApi<{items:Candidate[]}>(user,'candidates'),adminApi<{items:Job[]}>(user,'jobs')]);
   setCandidates(queue.items||[]);setJobs((updatedJobs.items||[]).sort((x,y)=>y.createdAt.localeCompare(x.createdAt)));
   if(result.status==='done'||result.status==='failed'){setJobActive('');if(result.status==='failed')setError('Discovery job failed. Review the errors and retry with a new job.');}
  }catch(e){setError(e instanceof Error?e.message:'Discovery processing failed.');setJobActive('');}
  finally{jobLock.current=false;setJobBusy(false);}
 };
 useEffect(()=>{
  if(access!=='allowed'||!jobActive)return;
  const interval=window.setInterval(()=>{void advance(jobActive);},2600);
  return()=>window.clearInterval(interval);
 },[access,jobActive]);
 useEffect(()=>{
  if(!editor&&!selectedUser)return;
  const previous=document.body.style.overflow;document.body.style.overflow='hidden';
  const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!busy){setEditor(null);setCandidateEdit(null);setSelectedUser(null);}};
  window.addEventListener('keydown',onKey);
  return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',onKey);};
 },[Boolean(editor),Boolean(selectedUser),busy]);
 const recent=(jobs||[]).find(job=>job.id===jobActive);
 const filteredUsers=users.filter(record=>[record.email,record.uid,record.organisation?.name,record.organisation?.category,record.organisation?.province]
   .some(value=>String(value||'').toLowerCase().includes(userSearch.trim().toLowerCase())));
 const reviewableCandidates=candidates.filter(candidate=>candidate.status!=='discarded');
 const list=opportunities.filter(op=>(filter==='all'||op.status===filter)&&(!search.trim()||[op.title,op.funder,op.sector].join(' ').toLowerCase().includes(search.toLowerCase())));
 const leave=async()=>{if(auth)await signOut(auth);onExit();};
 if(access==='checking')return <div className="oa-guard"><div className="oa-guard-icon"><ShieldCheck size={27}/></div><h2>Checking administrator permissions…</h2></div>;
 if(access==='failed')return <div className="oa-guard"><div className="oa-guard-icon"><Bell size={28}/></div><h2>Could not verify administrator access</h2><p>The network or admin server did not respond. Your Firebase role has not been changed.</p><button className="bo-primary" onClick={()=>void check()}>Try again <RefreshCw size={16}/></button></div>;
 if(access==='denied')return <div className="oa-guard"><div className="oa-guard-icon"><LockKeyhole size={28}/></div><h2>Administrator access required</h2><p>This dashboard is protected by a Firebase admin custom claim. Sign in with the Firebase account that has admin access. If your role was just granted, refresh your session.</p><button className="bo-primary" onClick={()=>void check()}>Refresh permissions <RefreshCw size={16}/></button><button className="oa-outline" onClick={onWorkspace}>Return to your workspace <ArrowRight size={16}/></button></div>;
 return <div className="oa-shell">
  {navOpen&&<button className="oa-scrim" aria-label="Close admin navigation" onClick={()=>setNavOpen(false)}/>}
  <aside className={'oa-sidebar '+(navOpen?'open':'')}><div className="oa-brand"><span className="oa-mark">o<span>.</span></span><span><strong>OPPOTRON</strong><small>ADMINISTRATION</small></span><button aria-label="Close navigation" onClick={()=>setNavOpen(false)}><X size={19}/></button></div>
   <div className="oa-navigation"><div className="oa-nav-caption">MANAGEMENT</div>{sections.map(item=><button key={item.id} onClick={()=>go(item.id)} className={section===item.id?'active':''}>{item.icon}<span>{item.label}</span>{section===item.id&&<ChevronRight size={15}/>}</button>)}</div>
   <div className="oa-sidebar-bottom"><button onClick={onWorkspace}><ArrowLeft size={17}/> Nonprofit workspace</button><button onClick={()=>void leave()}><LogOut size={17}/> Sign out</button><span>OPPOTRON · VERIFIED ADMIN ONLY</span></div>
  </aside>
  <main className="oa-main"><header className="oa-header"><div><button className="oa-menu" aria-label="Open navigation" onClick={()=>setNavOpen(true)}><Menu size={20}/></button><span>ADMINISTRATION</span><ChevronRight size={15}/><strong>{sections.find(x=>x.id===section)?.label}</strong></div><div><span className="oa-admin-pill"><ShieldCheck size={15}/> Verified admin</span><span className="oa-avatar">{user.email?.slice(0,1).toUpperCase()||'A'}</span></div></header>
   <div className="oa-content">
    {notice&&<div className="oa-feedback success" role="status"><CheckCircle2 size={17}/>{notice}<button aria-label="Dismiss" onClick={()=>setNotice('')}><X size={15}/></button></div>}
    {error&&<div className="oa-feedback error" role="alert"><Bell size={17}/>{error}<button aria-label="Dismiss" onClick={()=>setError('')}><X size={15}/></button></div>}
    <div className="oa-page-title"><div><div className="oa-eyebrow"><span/> OPPOTRON ADMINISTRATION</div><h1>{section==='overview'?'Platform overview':section==='users'?'Users & organisations':section==='opportunities'?'Funding opportunities':'Discovery engine'}<span>.</span></h1><p>{section==='overview'?'Manage your platform’s funding inventory and discovery activity.':section==='users'?'Inspect registered accounts and the nonprofit records they have saved.':section==='opportunities'?'Create, verify, publish and maintain one shared source of funding records.':'Find funding calls with Firecrawl and Tavily, then review every extraction before publishing.'}</p></div><button className="oa-refresh" onClick={refresh} disabled={loading}><RefreshCw size={16}/>{loading?'Loading…':'Refresh'}</button></div>
    {section==='overview'&&<><div className="oa-metrics">
      {([{label:'Registered users',value:summary?.totalUsers,icon:<Users size={20}/>},
       {label:'Organisation records',value:summary?.organisations,icon:<Users size={20}/>},
       {label:'All opportunities',value:summary?.totalOpportunities,icon:<HeartHandshake size={20}/>},
       {label:'Published',value:summary?.published,icon:<CheckCircle2 size={20}/>},
       {label:'Active deadlines',value:summary?.active,icon:<Clock3 size={20}/>},
       {label:'Pending review',value:summary?.pendingReviews,icon:<FileText size={20}/>},
       {label:'Discovery jobs',value:summary?.discoveryJobs,icon:<Compass size={20}/>}]).map(item=><div className="oa-metric" key={item.label}><div><span>{item.label}</span>{item.icon}</div><strong>{item.value??'—'}</strong><small>{item.label==='Active deadlines'?'Published, deadline not expired':item.label==='Organisation records'?'NPO profiles in Firestore':item.label==='Registered users'?'Requires Firebase service account':'Shared funding administration'}</small></div>)}
    </div><div className="oa-quick-grid"><button onClick={()=>go('opportunities')}><span><HeartHandshake size={23}/></span><strong>Manage the funding database</strong><small>Review and publish opportunities</small><ArrowRight size={18}/></button><button onClick={()=>go('discovery')}><span><Compass size={23}/></span><strong>Run a funding discovery</strong><small>Search with Firecrawl, fallback Tavily</small><ArrowRight size={18}/></button><button onClick={()=>go('users')}><span><Users size={23}/></span><strong>Review organisations</strong><small>See onboarding and account details</small><ArrowRight size={18}/></button></div>{summary?.partial&&<p className="oa-caveat">Counts are calculated from the first 1,000 organisation and opportunity records. Pagination is required for larger volumes.</p>}</>}
    {section==='users'&&<section className="oa-panel"><div className="oa-panel-heading"><div><div className="oa-kicker">REGISTERED ACCOUNTS</div><h3>{users.length} accounts loaded</h3><p>Search by email, organisation, UID, focus area or province.</p></div></div>
       {usersWarning&&<div className="oa-caveat">{usersWarning}</div>}
       <div className="oa-toolbar"><label className="oa-search"><Search size={17}/><input value={userSearch} onChange={e=>setUserSearch(e.target.value)} aria-label="Find registered user" placeholder="Find a user or organisation…"/></label></div>
       {loading&&!users.length?<div className="oa-empty" role="status">Loading registered accounts…</div>:filteredUsers.length?
       <div className="oa-table-wrap"><table className="oa-table"><thead><tr><th>ACCOUNT</th><th>ORGANISATION</th><th>REGISTERED</th><th>LAST LOGIN</th><th>ACCOUNT STATUS</th><th>DETAILS</th></tr></thead><tbody>{filteredUsers.map(record=><tr key={record.uid}><td><strong>{record.email||'Email unavailable'}</strong><small>{record.uid}</small></td><td><strong>{String(record.organisation?.name||'No profile yet')}</strong><small>{String(record.organisation?.category||'Focus area not supplied')}</small></td><td>{dateText(record.createdAt)}</td><td>{dateText(record.lastLoginAt||String(record.organisation?._updatedAt||''))}</td><td><span className={'oa-status '+(record.disabled?'archived':'verified')}>{record.disabled?'Disabled':'Active'}</span></td><td><button className="oa-small-link" onClick={()=>setSelectedUser(record)}>View details <ArrowRight size={14}/></button></td></tr>)}</tbody></table></div>:
       <div className="oa-empty">{userSearch?'No users match your search.':'No registered accounts found.'}</div>}
     </section>}
     {section==='opportunities'&&<section className="oa-panel"><div className="oa-panel-heading"><div><div className="oa-kicker">SHARED FUNDING DATABASE</div><h3>{opportunities.length} structured opportunities</h3></div><button className="oa-primary" onClick={()=>{setCandidateEdit(null);setEditor({...emptyEditor});}}><Plus size={17}/> Add manually</button></div>
      <div className="oa-toolbar"><label className="oa-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search funders and opportunities…" aria-label="Search opportunities"/></label><select value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Filter opportunity status"><option value="all">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></div>
      <div className="oa-table-wrap"><table className="oa-table"><thead><tr><th>OPPORTUNITY</th><th>FOCUS AREA</th><th>DEADLINE</th><th>SOURCE REVIEW</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>{list.map(op=><tr key={op.id}><td><strong>{op.title}</strong><small>{op.funder}</small></td><td>{op.sector||'Other'}</td><td>{op.deadline||'Not supplied'}</td><td><span className={'oa-status '+(op.verificationStatus==='verified'?'verified':'neutral')}>{op.verificationStatus==='unverified'?'Not checked':op.verificationStatus==='reviewed'?'Admin reviewed':op.verificationStatus||'Not checked'}</span></td><td><span className={'oa-status '+(op.status==='published'?'published':op.status==='archived'?'archived':'neutral')}>{op.status}</span></td><td><div className="oa-row-actions"><button onClick={()=>{setCandidateEdit(null);setEditor(initialEditor(op));}} title="Edit opportunity" aria-label={'Edit '+op.title} disabled={busy}><Edit3 size={17}/></button>
       {op.status!=='published'?<button onClick={()=>void status(op,'published')} title="Publish opportunity" aria-label={'Publish '+op.title} disabled={busy}><CheckCircle2 size={17}/></button>:<button onClick={()=>void status(op,'draft')} title="Unpublish" aria-label={'Unpublish '+op.title} disabled={busy}><X size={17}/></button>}
       <button onClick={()=>void status(op,'archived')} title="Archive" aria-label={'Archive '+op.title} disabled={busy||op.status==='archived'}><FolderOpen size={17}/></button>
       <button onClick={()=>void action('reverify',{id:op.id})} title="Recheck source with Firecrawl" aria-label={'Recheck '+op.title} disabled={!op.sourceUrl||busy}><RefreshCw size={16}/></button>
       <button onClick={()=>void remove(op)} title="Delete permanently" aria-label={'Delete '+op.title} disabled={busy}><Trash2 size={17}/></button>
      </div></td></tr>)}</tbody></table></div>
      {hasMoreOpportunities&&<div className="oa-caveat">Showing the first 1,000 opportunities. Additional records may exist.</div>}
       {!list.length&&<div className="oa-empty">No matching records. Add a funding opportunity or discover one from a source URL.</div>}
    </section>}
    {section==='discovery'&&<div className="oa-discovery">
      <section className="oa-panel oa-discovery-form"><div className="oa-panel-heading"><div><div className="oa-kicker">SOURCE DISCOVERY</div><h3>Find funding calls</h3><p>Search the web or extract one official funding page. Every result enters review before publication.</p></div></div>
        <div className="oa-providers"><div><strong>Live provider connections</strong><small>Admin-only API test · uses a small real search request to each provider</small></div>
        <button className="oa-outline" onClick={()=>void probe()} disabled={probeBusy}><RefreshCw size={15}/>{probeBusy?'Testing…':'Test Firecrawl & Tavily'}</button></div>
        {providerResults&&<div className="oa-provider-results">{(['firecrawl','tavily'] as const).map(name=><div key={name} className={providerResults[name]?.ok?'ok':'failed'}><span>{name==='firecrawl'?'Firecrawl':'Tavily'}</span><strong>{providerResults[name]?.ok?'Connected':'Connection failed'}</strong><small>{providerResults[name]?.message||'No result'}</small></div>)}</div>}

        <div className="oa-segments"><button className={discoverMode==='search'?'active':''} onClick={()=>setDiscoverMode('search')}><Search size={16}/> Search funding</button><button className={discoverMode==='url'?'active':''} onClick={()=>setDiscoverMode('url')}><Link2 size={16}/> Extract URL</button></div>
        {discoverMode==='search'?<><label>Describe what to discover<textarea rows={3} value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Find 50 CSI funding opportunities for education nonprofits in South Africa."/></label><label>Target results<select value={limit} onChange={e=>setLimit(Number(e.target.value))}>{[5,10,20,30,50].map(x=><option key={x} value={x}>{x} candidates</option>)}</select></label></>:
         <label>Funding opportunity website<input type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://funder.org.za/apply"/></label>}
        <button className="oa-primary" disabled={busy||jobBusy} onClick={()=>void begin()}><Compass size={17}/>{busy?'Starting…':discoverMode==='url'?'Extract opportunity':'Start discovery'} <ArrowRight size={16}/></button>
        <p className="oa-caveat">Firecrawl is the primary search and extraction provider. Tavily is a search fallback only. Source restrictions, provider quotas and site availability can reduce results.</p>
      </section>
      <section className="oa-panel oa-jobs"><div className="oa-panel-heading"><div><div className="oa-kicker">DISCOVERY ACTIVITY</div><h3>Persistent jobs</h3></div></div>
        {jobs.slice(0,10).map(job=><div className="oa-job" key={job.id}><div><strong>{job.query||job.sourceUrl}</strong><small>{job.provider||job.mode} · {dateText(job.createdAt)}</small></div>
          <span className={'oa-status '+(job.status==='done'?'published':'neutral')}>{job.status}</span>
          <div className="oa-job-progress"><span style={{width:((job.urls?.length?Math.min(100,(job.cursor/job.urls.length)*100):0))+'%'}}/></div>
          <small>{job.cursor||0} / {job.urls?.length||0} pages processed</small>
          {!['done','failed'].includes(job.status)&&<button className="oa-small-link" disabled={jobBusy} onClick={()=>{setJobActive(job.id);void advance(job.id);}}>Continue <ArrowRight size={14}/></button>}
          {(job.errors||[]).length>0&&<p className="oa-job-error">{job.errors.slice(-1)[0].message}</p>}
        </div>)}
        {!jobs.length&&<div className="oa-empty">No discovery jobs yet. Search for funding calls to start your research queue.</div>}
      </section>
      <section className="oa-panel oa-candidates"><div className="oa-panel-heading"><div><div className="oa-kicker">REVIEW & VERIFICATION</div><h3>Extracted candidates</h3></div></div>
       {reviewableCandidates.sort((a,b)=>b.extractedAt.localeCompare(a.extractedAt)).slice(0,100).map(candidate=><div className="oa-candidate" key={candidate.id}>
         <div className="oa-candidate-main"><span className={'oa-status '+(candidate.status==='imported'?'published':candidate.status==='review'?'verified':'neutral')}>{candidate.status}</span><h4>{candidate.title||'Unidentified funding page'}</h4><a href={candidate.sourceUrl} target="_blank" rel="noopener noreferrer">{candidate.sourceUrl} <ExternalLink size={13}/></a>
          {candidate.data?.funder&&<small>Funder: {candidate.data.funder} · {candidate.data.sector||'Sector unknown'}</small>}
          {candidate.duplicateOf&&<small>Possible duplicate: {candidate.duplicateOf}</small>}
          {candidate.error&&<p className="oa-job-error">{candidate.error}</p>}
          {candidate.notice&&<p>{candidate.notice}</p>}
         </div><div className="oa-candidate-actions">
          {candidate.data&&candidate.status!=='imported'&&<button className="oa-primary" disabled={busy} onClick={()=>{setCandidateEdit(candidate);setEditor(initialEditor({...candidate.data,sourceUrl:candidate.sourceUrl}));}}>Review & import <ArrowRight size={15}/></button>}
          {candidate.status==='imported'&&<span className="oa-status published"><Check size={14}/> Imported</span>}
          {!['discarded','imported'].includes(candidate.status)&&<button className="oa-outline" disabled={busy} onClick={()=>void action('discard',{id:candidate.id})}>Discard</button>}
         </div></div>)}
       {!reviewableCandidates.length&&<div className="oa-empty">Extracted opportunities will appear here, ready for verification and editing before you publish them.</div>}
      </section>
    </div>}
   </div>
  </main>
  {selectedUser&&<div className="oa-modal-backdrop"><section className="oa-modal oa-user-modal" role="dialog" aria-modal="true" aria-labelledby="oa-user-title">
    <div className="oa-modal-head"><div><span className="oa-kicker">REGISTERED ACCOUNT</span><h2 id="oa-user-title">{selectedUser.organisation?.name?String(selectedUser.organisation.name):'Account details'}</h2><p>Firebase account and saved organisation metadata.</p></div><button aria-label="Close account details" onClick={()=>setSelectedUser(null)}><X size={21}/></button></div>
    <div className="oa-modal-scroll"><dl className="oa-user-details">{([
      ['Email address',selectedUser.email],['Firebase UID',selectedUser.uid],['Account status',selectedUser.disabled?'Disabled':'Active'],
      ['Registered',dateText(selectedUser.createdAt)],['Last login',dateText(selectedUser.lastLoginAt)],
      ['Organisation',selectedUser.organisation?.name],['Focus area',selectedUser.organisation?.category],
      ['Province',selectedUser.organisation?.province],['Registration number',selectedUser.organisation?.registration],
      ['Contact person',selectedUser.organisation?.contactPerson],['Website',selectedUser.organisation?.website]
     ] as [string,unknown][]).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{String(value||'Not provided')}</dd></div>)}</dl><p className="oa-caveat">These details are supplied by the account holder. No independent compliance verification is implied.</p></div>
    <div className="oa-modal-actions"><button className="oa-outline" onClick={()=>setSelectedUser(null)}>Close</button></div>
   </section></div>}
  {editor&&<div className="oa-modal-backdrop">
    <section className="oa-modal" role="dialog" aria-modal="true" aria-labelledby="oa-editor-title"><div className="oa-modal-head"><div><span className="oa-kicker">{candidateEdit?'REVIEW EXTRACTED OPPORTUNITY':editor.id?'EDIT FUNDING RECORD':'MANUAL FUNDING ENTRY'}</span><h2 id="oa-editor-title">{candidateEdit?'Review and import':'Funding opportunity details'}</h2><p>Add only what you know. You can publish without a website or verified source — use an email, phone number, or instructions instead.</p></div><button aria-label="Close editor" onClick={()=>{setEditor(null);setCandidateEdit(null);}}><X size={21}/></button></div>
    {error&&<div className="oa-editor-error" role="alert"><Bell size={16}/>{error}</div>}
     <form onSubmit={e=>void submitEditor(e)}><div className="oa-modal-scroll">
      <div className="oa-form-grid"><label className="full">Opportunity title *<input autoFocus required maxLength={280} value={editor.title} onChange={e=>setEditor({...editor,title:e.target.value})}/></label>
        <label>Funder name (optional)<input maxLength={180} value={editor.funder} onChange={e=>setEditor({...editor,funder:e.target.value})}/></label>
        <label>Funding sector<select value={editor.sector} onChange={e=>setEditor({...editor,sector:e.target.value})}>{sectors.map(s=><option key={s}>{s}</option>)}</select></label>
        <label className="full">Description<textarea rows={4} value={editor.description} onChange={e=>setEditor({...editor,description:e.target.value})}/></label>
        <label className="full">Eligibility conditions<textarea rows={3} value={editor.eligibility} onChange={e=>setEditor({...editor,eligibility:e.target.value})}/></label>
        <label>Required registration<input value={editor.registration} onChange={e=>setEditor({...editor,registration:e.target.value})} placeholder="e.g. Registered NPO, PBO"/></label>
        <label>Geographic coverage<input value={editor.coverage} onChange={e=>setEditor({...editor,coverage:e.target.value})} placeholder="e.g. Gauteng or South Africa"/></label>
        <label>Funding amount<input value={editor.amount} onChange={e=>setEditor({...editor,amount:e.target.value})} placeholder="Unknown if not specified"/></label>
        <label>Application deadline<input type="date" value={editor.deadline} onChange={e=>setEditor({...editor,deadline:e.target.value})}/></label>
        <label>Application round<input value={editor.round} onChange={e=>setEditor({...editor,round:e.target.value})} placeholder="e.g. 2027 annual cycle"/></label>
         <label>Source website (optional)<input type="url" value={editor.sourceUrl} onChange={e=>setEditor({...editor,sourceUrl:e.target.value})} placeholder="https://…"/></label>
         <label>Application website (optional)<input type="url" value={editor.applicationUrl} onChange={e=>setEditor({...editor,applicationUrl:e.target.value})} placeholder="https://…"/></label>
         <label>Contact email (optional)<input type="email" maxLength={254} value={editor.contactEmail} onChange={e=>setEditor({...editor,contactEmail:e.target.value})} placeholder="applications@example.org"/></label>
         <label>Contact phone / WhatsApp (optional)<input type="tel" maxLength={100} value={editor.contactPhone} onChange={e=>setEditor({...editor,contactPhone:e.target.value})} placeholder="+27 11 123 4567"/></label>
         <label className="full">How to apply or contact the funder<textarea rows={3} maxLength={2500} value={editor.applicationInstructions} onChange={e=>setEditor({...editor,applicationInstructions:e.target.value})} placeholder="Email a proposal, phone for details, visit in person, or other instructions."/></label>
        <label className="full">Required documents (one per line)<textarea rows={3} value={editor.requirementsText} onChange={e=>setEditor({...editor,requirementsText:e.target.value})} placeholder="NPO registration certificate&#10;Financial statements"/></label>
        <label className="full">Supporting PDF links (one per line, format: Name | https://…)<textarea rows={3} value={editor.documentsText} onChange={e=>setEditor({...editor,documentsText:e.target.value})}/></label>
        <label>Source review (optional)<select value={editor.verificationStatus} onChange={e=>setEditor({...editor,verificationStatus:e.target.value})}><option value="unverified">Not checked</option><option value="reviewed">Reviewed by admin</option><option value="verified">Verified against source</option></select></label>
        <label>Publication status<select value={editor.status} onChange={e=>setEditor({...editor,status:e.target.value})} disabled={!!candidateEdit}><option value="draft">Draft / private</option><option value="published">Published to nonprofits</option><option value="archived">Archived</option></select></label>
      </div><p className="oa-caveat">Manual records can be published without a website or verification status. Add contact information when available, and distinguish supplied details from independently verified facts. Duplicate funder/title/round entries are still blocked to keep the feed tidy.</p>
    </div><div className="oa-modal-actions">
      {editor.id&&!candidateEdit&&editor.documentsText.trim()&&<button type="button" className="oa-outline" disabled={busy} onClick={()=>void action('store-pdfs',{id:editor.id})}><CloudDownload size={16}/> Store source PDFs</button>}
      <button type="button" className="oa-outline" onClick={()=>{setEditor(null);setCandidateEdit(null);}}>Cancel</button>
      <button className="oa-primary" type="submit" disabled={busy}>{busy?'Saving…':candidateEdit?'Import as private draft':editor.id?'Save changes':'Create opportunity'} <Check size={16}/></button>
    </div></form></section>
  </div>}
 </div>;
}
