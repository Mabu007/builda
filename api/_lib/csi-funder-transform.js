import {createHash} from 'node:crypto';
import {CSI_COMPANIES,CSI_FOOTNOTES,CSI_SOURCE,CSI_SOURCE_DATE} from './csi-corporate-2025.js';
export const CSI_IMPORT_VERSION='trialogue2025-companies-v1';
export const corporateFunderId=name=>createHash('sha256').update(String(name||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ')).digest('hex').slice(0,40);
export function spendValue(raw){
 if(!/^\d[\d,.]*$/.test(String(raw)))return null;
 return Number(String(raw).replace(/,/g,''));
}
export function csiFunderFields(row,existing=null,stamp=new Date().toISOString()){
 const focus=String(row.focus||'').trim();
 const focusTags=focus.split(',').map(v=>v.trim()).filter(Boolean).slice(0,12);
 const currentTags=Array.isArray(existing?.sectors)?existing.sectors.filter(Boolean):[];
 const sectors=[...new Set([...currentTags,...focusTags])].slice(0,20);
 const csiResearch={
  source:CSI_SOURCE,sourceEdition:2025,compiledAt:CSI_SOURCE_DATE,
  page:Number(row.handbookPage),
  sourceReport:String(row.sourceReport||'').trim(),
  reportedDevelopmentFocus:focus,
  reported2024_25Rm:spendValue(row.spend2024_25),
  reported2024_25Label:row.spend2024_25,
  reported2023_24Rm:spendValue(row.spend2023_24),
  reported2023_24Label:row.spend2023_24,
  qualification:row.note?CSI_FOOTNOTES[row.note]||'':'',
  qualificationNumber:row.note||null,
  confirmedCurrentApplications:false,
  status:'Historical funder intelligence; no open call established',
  importVersion:CSI_IMPORT_VERSION
 };
 const id=corporateFunderId(row.name);
 const description='Historically reported CSI focus: '+focus+'.';
 const base={id,slug:id,name:row.name,description,website:'',contactEmail:'',contactPhone:'',
  sectors,fundingTypes:['Corporate CSI'],sourceUrls:[],geography:'',
  published:false,researchLeadCount:0,createdAt:stamp,updatedAt:stamp};
 // Existing funder edits are authoritative; attach only non-destructive historical research.
 if(existing)return {...existing,csiResearch,updatedAt:stamp,
  ...(existing.description?{}:{description}),
  ...(currentTags.length?{}:{sectors}),
  ...(Array.isArray(existing.fundingTypes)&&existing.fundingTypes.length?{}:{fundingTypes:['Corporate CSI']})};
 return {...base,csiResearch};
}
export function csiResearchSummary(){
 const records=CSI_COMPANIES;
 return {companies:records.length,publishedSpend:records.filter(r=>spendValue(r.spend2024_25)!==null).length,
  notDisclosed:records.filter(r=>r.spend2024_25==='Not disclosed').length,
  notAvailable:records.filter(r=>r.spend2024_25==='Not available').length,
  notes:Object.keys(CSI_FOOTNOTES).length};
}
