import type {FundingOpportunity} from './funding';

/** Funder-published call information reviewed on 17 Nov 2026.
 * These overrides are limited to the exact 2026 Gauteng research imports, never user-entered records.
 * Recheck against the funder if an application window changes.
 */
export type ConfirmedCall={summary:string;who:string;important?:string;steps:string[];
 applyUrl?:string;contactEmail?:string;amount?:string;coverage?:string;type?:string;
 checkedOn:string;sourceUrl:string};
const checkedOn='2026-11-17';
const source=(value:Omit<ConfirmedCall,'checkedOn'>):ConfirmedCall=>({...value,checkedOn});
const verified:Record<string,ConfirmedCall>={
 'Economic Opportunity Innovation Challenge':source({
  summary:'Funding to expand proven programmes that help economically excluded South Africans access jobs, earn income or build sustainable livelihoods.',
  who:'Organisations with an existing, evidence-backed employment, livelihoods or income programme that can expand or be replicated.',
  important:'Not a general skills-training or crèche operating grant. You must demonstrate a credible route to actual jobs or income, with evidence of earlier delivery.',
  steps:['Prepare evidence of previous results and a clear plan to expand.','Complete the online Scatec application form.','Upload supporting documents and submit by the closing date.'],
  applyUrl:'https://www.cognitoforms.com/Scatec1/ScatecSolutionsBroadBasedTrustEconomicOpportunityInnovationChallenge',
  contactEmail:'communityinvestments@scatec.com',amount:'R1 million–R4 million',coverage:'South Africa',
  type:'Grant',sourceUrl:'https://www.scatec.com/en/wp-content/uploads/sites/2/2026/10/Economic_Opportunity_Innovation_Challenge_FAQ.pdf'
 }),
 'Community-Led Initiatives Enabler':source({
  summary:'Support for community-led programmes that improve local wellbeing, livelihoods and opportunities.',
  who:'Community-rooted organisations delivering practical interventions aligned with the Scatec Solutions Broad-Based Trust priorities.',
  important:'Check the call document for eligibility and safeguarding requirements before submitting.',
  steps:['Review the Scatec community-led call requirements.','Prepare your programme plan and supporting documents.','Submit the application on the Scatec form before the deadline.'],
  applyUrl:'https://www.cognitoforms.com/Scatec1/SolutionsTrustCommunityLedInitiativesEnabler',
  contactEmail:'communityinvestments@scatec.com',type:'Grant',
  sourceUrl:'https://www.scatec.com/en/sustainability/local-value-creation/'
 }),
 'Spur Foundation annual ECD grants':source({
  summary:'Funding for established nonprofits working in early childhood development, community wellbeing and related programmes.',
  who:'South African registered NGOs, NPOs or PBOs operating for at least five years, serving 50 or more people and able to supply audited financial statements.',
  important:'Spur Foundation does not fund individual ECD centres. It works with registered NGO partners and eligible wider programmes.',
  steps:['Write a detailed two- to three-page proposal describing your project and the amount requested.','Email it to the Spur Foundation during its annual application window (1 November–28 February).'],
  contactEmail:'spurfoundation@spur.co.za',type:'Grant',
  sourceUrl:'https://spurfoundation.co.za/about-us'
 }),
 'DG Murray Trust ECD and literacy grants':source({
  summary:'Grants supporting innovative South African programmes addressing education, early childhood development and inequality.',
  who:'Organisations with a clear project proposal, achievable outcomes, implementation plan and budget aligned with DGMT’s investment priorities.',
  important:'DGMT does not fund individual school operating costs, infrastructure, vehicles or individual bursaries.',
  steps:['Check alignment with DGMT’s funding priorities.','Prepare a proposal of up to five pages, a project budget and NPO/PBO documents.','Create an account in DGMT’s grant portal and submit in the application window.'],
  type:'Grant',sourceUrl:'https://dgmt.co.za/apply-for-funding/'
 }),
 'German Missions Micro-Projects Scheme 2027':source({
  summary:'Micro-grants for practical poverty reduction, livelihoods and equal-opportunity projects that can be completed in 2027.',
  who:'Civil-society organisations serving disadvantaged South African communities with a defined, self-contained project and some contribution of their own.',
  important:'Up to €25,000 per project. Projects must be completed within the funding year and need an applicant contribution; check local priority regions.',
  steps:['Download the application form and budget template from the official notice.','Get the forms signed by the required responsible representatives.','Email the complete application to the German Embassy before 30 November 2026.'],
  contactEmail:'microprojects@pret.diplo.de',amount:'Up to €25,000',type:'Grant',
  sourceUrl:'https://southafrica.diplo.de/sa-en/04-news/2738342-2738342'
 }),
 'Leverage Fund Institute Round Two':source({
  summary:'Flexible support for community-rooted civil-society networks strengthening local systems, cooperation and collective action.',
  who:'South African nonprofit or civil-society actors working substantively across at least three districts in one province, with active community relationships.',
  important:'Not aimed at standalone organisations without a wider network or a footprint across three districts.',
  steps:['Explain your networks, community reach and evidence of collaboration.','Prepare an indicative budget and funding request.','Register on the ACT Ubumbano application system and submit by 30 November 2026.'],
  amount:'R700,000–R975,000',type:'Grant',
  sourceUrl:'https://www.actubumbano.org/lfi-round-two-funding-call/'
 }),
 'Rise Up Leadership and Advocacy Accelerator':source({
  summary:'A leadership and advocacy training accelerator for South African changemakers advancing the rights of women and girls.',
  who:'Community leaders working on gender equity and social justice in Gauteng or KwaZulu-Natal who can commit to the programme.',
  important:'This is primarily an accelerator, not an upfront grant. Eligible graduates may later apply for seed funding of up to US$17,000; funding is not guaranteed.',
  steps:['Review the official application criteria for the leadership cohort.','Apply for the accelerator before 30 November 2026.','If selected, attend the training; eligible participants can explore later seed funding.'],
  contactEmail:'SouthAfricaRep@riseuptogether.org',type:'Training with possible grant',
  sourceUrl:'https://www.riseuptogether.org/call-for-applications-rise-up-together-launches-leadership-advocacy-accelerator-in-south-africa/'
 })
};
export function confirmedCall(op:FundingOpportunity):ConfirmedCall|undefined{
 return op.source==='gauteng-ecd-arts-2026-11'?verified[op.title]:undefined;
}
export const confirmedFunderContacts:Record<string,{email?:string;website?:string}>={
 'Scatec Solutions Broad-Based Trust':{email:'communityinvestments@scatec.com',website:'https://www.scatec.com/en/sustainability/local-value-creation/'},
 'Spur Foundation':{email:'spurfoundation@spur.co.za',website:'https://spurfoundation.co.za/about-us'},
 'DG Murray Trust':{website:'https://dgmt.co.za/apply-for-funding/'},
 'German Missions South Africa':{email:'microprojects@pret.diplo.de',website:'https://southafrica.diplo.de/sa-en/04-news/2738342-2738342'},
 'Rise Up Together':{email:'SouthAfricaRep@riseuptogether.org',website:'https://www.riseuptogether.org/call-for-applications-rise-up-together-launches-leadership-advocacy-accelerator-in-south-africa/'},
 'ACT Ubumbano':{website:'https://www.actubumbano.org/lfi-round-two-funding-call/'}
};
