const AXO_SCANNER_VERSION='2.4-supabase-insert-only';
import { createSupabaseServerClient } from '../utils/supabase/server.js';
const W={technical:.15,entity:.20,content:.20,authority:.20,discoverability:.25};
const clamp=n=>Math.max(0,Math.min(100,Math.round(n)));
const stripTags=s=>String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const attr=(html,regex)=>((html.match(regex)||[])[1]||'').trim();
const has=(text,arr)=>arr.some(x=>x&&text.toLowerCase().includes(String(x).toLowerCase()));
const normalizeUrl=d=>/^https?:\/\//i.test(String(d).trim())?String(d).trim():`https://${String(d).trim()}`;

async function fetchPage(url){
 const c=new AbortController(); const t=setTimeout(()=>c.abort(),12000);
 try{
  const r=await fetch(url,{redirect:'follow',signal:c.signal,headers:{'user-agent':'AXO-Visibility-Scanner/1.2 (+https://axo-8.com)'}});
  return {ok:r.ok,status:r.status,url:r.url,html:await r.text()};
 } finally { clearTimeout(t); }
}

function normalizeMarket(market,foreignMarket,location){
  if(market==='foreign'){
    const fm=String(foreignMarket||'').trim();
    return fm || String(location||'').trim() || 'globalno';
  }
  return 'Slovenija';
}

function marketQueryLocation(market,foreignMarket,location){
  const target=normalizeMarket(market,foreignMarket,location);
  if(market==='foreign') return target;
  const loc=String(location||'').trim();
  if(!loc) return 'Slovenija';
  // Keep a Slovenian city/region when supplied, while explicitly anchoring the market to Slovenia.
  return `${loc}, Slovenija`;
}

function queries(service,location){return [`najboljši ${service} ${location}`,`priporočen ${service} ${location}`,`kje najdem ${service} v ${location}`,`${service} ${location} priporočila`,`koga izbrati za ${service} ${location}`,`${service} ${location} cena in ponudniki`,`top ponudniki ${service} ${location}`,`${service} blizu ${location}`]}
async function braveSearch(query){
 const key=process.env.BRAVE_SEARCH_API_KEY;
 if(!key)throw new Error('BRAVE_SEARCH_API_KEY missing');
 const u=new URL('https://api.search.brave.com/res/v1/web/search');
 u.searchParams.set('q',query);
 u.searchParams.set('count','8');
 u.searchParams.set('search_lang','sl');
 u.searchParams.set('country','ALL');
 u.searchParams.set('safesearch','moderate');
 const r=await fetch(u,{headers:{'Accept':'application/json','Accept-Encoding':'gzip','X-Subscription-Token':key}});
 if(!r.ok){const t=await r.text();throw new Error(`Brave ${r.status}: ${t.slice(0,700)}`)}
 const j=await r.json();
 return (j.web?.results||[]).slice(0,8).map((x,i)=>({rank:i+1,title:String(x.title||''),url:String(x.url||''),description:String(x.description||'')}));
}
function normalizeNeedle(s){return String(s||'').toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/[\s._\-/]+/g,' ').trim()}
function detectedIn(haystack,value){
 const hay=normalizeNeedle(haystack),needle=normalizeNeedle(value);
 if(!needle||needle.length<3)return false;
 return hay.includes(needle);
}
function braveSignal(results,aliases,competitors){
 const joined=results.map(x=>`${x.title} ${x.url} ${x.description}`).join(' ');
 const brandRanks=results.filter(x=>aliases.some(a=>detectedIn(`${x.title} ${x.url} ${x.description}`,a))).map(x=>x.rank);
 const competitorHits=(competitors||[]).filter(c=>detectedIn(joined,c));
 return {brandMentioned:brandRanks.length>0,bestRank:brandRanks.length?Math.min(...brandRanks):null,competitorsMentioned:competitorHits};
}
async function liveCheck(brand,domain,competitors,service,location,market='slovenia',foreignMarket=''){
 if(!process.env.BRAVE_SEARCH_API_KEY)return {configured:false,provider:'brave_search',results:[],error:'BRAVE_SEARCH_API_KEY missing'};
 const qs=queries(service,marketQueryLocation(market,foreignMarket,location));
 const aliases=[brand,domain,domain.split('.')[0]].filter(Boolean);
 try{
  const results=[];
  // Sequential requests keep us inside conservative API rate limits.
  for(const q of qs){
   const searchResults=await braveSearch(q);
   const signal=braveSignal(searchResults,aliases,competitors||[]);
   const brandMentioned=signal.brandMentioned;
   // Conservative recommendation proxy: measured brand appears in top 3 organic results.
   const brandRecommended=signal.bestRank!==null&&signal.bestRank<=3;
   results.push({
    query:q,
    brandMentioned,
    brandRecommended,
    bestRank:signal.bestRank,
    competitorsMentioned:signal.competitorsMentioned||[],
    evidence:searchResults.slice(0,5),
    analysisMode:'brave_only'
   });
  }
  return {configured:true,provider:'brave_search',results,error:null};
 }catch(e){
  console.error('Brave live visibility failed:',e);
  return {configured:true,provider:'brave_search',results:[],error:e.message||'Brave live check failed'};
 }
}
function discoverability(results){
 const mentions=results.filter(r=>r.brandMentioned).length,recs=results.filter(r=>r.brandRecommended).length;
 const competitorQueries=results.filter(r=>r.competitorsMentioned.length>0).length;
 const pressure=results.reduce((a,r)=>a+r.competitorsMentioned.length,0);
 const mentionRate=mentions/results.length,recRate=recs/results.length,competitorRate=competitorQueries/results.length;
 return {
  score:clamp(mentionRate*45+recRate*45+(1-competitorRate)*10),weight:25,
  findings:[`Znamka zaznana pri ${mentions}/${results.length} buyer-intent poizvedbah.`,`Kot priporočilo zaznana pri ${recs}/${results.length}.`,pressure?`Podani konkurenti so bili skupaj zaznani ${pressure}×.`:'Podani konkurenti niso bili zaznani pri testiranih poizvedbah.']
 };
}
async function runScan(input){
 const page=await fetchPage(normalizeUrl(input.domain));if(!page.ok)throw new Error(`Spletne strani ni mogoče prebrati (HTTP ${page.status}).`);
 const html=page.html,body=stripTags(html).slice(0,150000),lower=body.toLowerCase();
 const title=stripTags(attr(html,/<title[^>]*>([\s\S]*?)<\/title>/i));
 const description=attr(html,/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)||attr(html,/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
 const h1=stripTags(attr(html,/<h1[^>]*>([\s\S]*?)<\/h1>/i));
 const schema=(html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi)||[]).join(' ');
 const hrefs=[...html.matchAll(/href=["']([^"']+)["']/gi)].map(m=>m[1]); const host=new URL(page.url).hostname.replace(/^www\./,'');
 const brand=(h1||title.split(/[|–—-]/)[0]||host).trim().slice(0,120); const service=has(lower,[input.service]),location=has(lower,[input.location]);
 const flags={title:title.length>=10,desc:description.length>=50,h1:!!h1,canonical:/rel=["']canonical["']/i.test(html),schema:schema.length>20,org:/Organization|LocalBusiness|ProfessionalService|Store/i.test(schema),serviceSchema:/Service|Product/i.test(schema),faqSchema:/FAQPage/i.test(schema),contact:has(lower,['kontakt','contact','telefon','phone','email','e-pošta']),about:has(lower,['o nas','about us','o podjetju','kdo smo']),service,location,serviceLocation:service&&location,social:has(hrefs.join(' '),['facebook.com','instagram.com','linkedin.com','tiktok.com','youtube.com']),proof:has(lower,['reference','mnenja','ocene','reviews','testimonial','certifikat','primeri','case study']),faqText:has(lower,['pogosta vprašanja','faq','vprašanja in odgovori']),pricing:has(lower,['cenik','cena','cene','price','pricing']),expertise:has(lower,['izkušnje','let izkušenj','strokovn','specialist','certifikat','licenca'])};
 const internal=hrefs.filter(x=>x.startsWith('/')||x.includes(host)).length,words=body.split(/\s+/).filter(Boolean).length;
 let p=0,f=[];[[flags.title,15,'Jasen title tag'],[flags.desc,12,'Meta opis'],[flags.h1,12,'Glavni H1'],[flags.canonical,8,'Canonical'],[flags.schema,18,'Structured data'],[flags.org,15,'Organization/LocalBusiness schema'],[flags.serviceSchema,10,'Service/Product schema'],[internal>=5,10,'Notranje povezave']].forEach(([o,n,l])=>o?p+=n:f.push(`Manjka ali je šibko: ${l}.`));const technical={score:clamp(p),weight:15,findings:f.slice(0,5)};
 p=0;f=[];[[brand.length>2,15,'identiteta znamke'],[flags.service,25,'jasna glavna storitev'],[flags.location,20,'jasna lokacija/trg'],[flags.serviceLocation,15,'povezava storitev + lokacija'],[flags.contact,10,'kontaktni podatki'],[flags.about,8,'predstavitev podjetja'],[flags.org,7,'entity schema']].forEach(([o,n,l])=>o?p+=n:f.push(`Ni dovolj jasno: ${l}.`));const entity={score:clamp(p),weight:20,findings:f.slice(0,5)};
 p=0;f=[];if(words>=700)p+=20;else f.push('Na ključni strani je malo vsebine za razumevanje ponudbe.');if(flags.service)p+=20;if(flags.location)p+=10;if(flags.faqText||flags.faqSchema)p+=15;else f.push('Ni jasnega FAQ / question-answer sloja.');if(flags.pricing)p+=10;else f.push('Manjka vsebina za cenovni nakupni intent.');if(internal>=8)p+=10;if(flags.proof)p+=15;else f.push('Manjka dovolj dokazov, referenc ali primerov rezultatov.');const content={score:clamp(p),weight:20,findings:f.slice(0,5)};
 p=0;f=[];if(flags.contact)p+=15;else f.push('Kontaktna transparentnost je šibka.');if(flags.about)p+=15;else f.push('Manjka jasen podjetniški/about signal.');if(flags.social)p+=15;else f.push('Na strani niso jasno povezani zunanji social/business profili.');if(flags.proof)p+=25;else f.push('Ni dovolj review/reference/case-study signalov.');if(flags.expertise)p+=15;else f.push('Expertise signali niso jasno izpostavljeni.');if(flags.org)p+=15;const authority={score:clamp(p),weight:20,findings:f.slice(0,5)};
 const live=await liveCheck(brand,host,input.competitors||[],input.service,input.location);
 if(!live.configured)throw new Error('Live visibility sloj še ni konfiguriran. Dodajte BRAVE_SEARCH_API_KEY v Vercel Environment Variables.');
 if(!live.results.length)throw new Error(`Live visibility ni uspel: ${live.error||'neznana Brave Search napaka'}`);
 const qres=live.results;const disc=discoverability(qres);const total=clamp(technical.score*W.technical+entity.score*W.entity+content.score*W.content+authority.score*W.authority+disc.score*W.discoverability);
 const issues=[...entity.findings.map(text=>({severity:'kritično',text})),...technical.findings.map(text=>({severity:'pomembno',text})),...content.findings.map(text=>({severity:'pomembno',text})),...authority.findings.map(text=>({severity:'priložnost',text}))].slice(0,14);
 const summary=total<50?'Vaša spletna prisotnost trenutno pušča dovolj vrzeli, da imajo konkurenti realno možnost prevzeti AI/search priporočila pred vami.':total<70?'Osnova obstaja, vendar je vidnost nekonsistentna. Največji potencial je v jasnejši entiteti, vsebinski pokritosti in authority signalih.':'Osnova je dobra. Naslednji nivo je povečanje deleža buyer-intent poizvedb, kjer ste dejansko omenjeni ali priporočeni.';
 return {createdAt:new Date().toISOString(),mode:'live_brave_search',provider:live.provider,input,business:{name:brand,title,description},scores:{technical,entity,content,authority,discoverability:disc,total},queryResults:qres,issues,summary};
}

async function saveScanToSupabase(result){
 const supabase=createSupabaseServerClient();
 const payload={
  email:String(result.input?.email||'').trim().toLowerCase(),
  domain:String(result.input?.domain||''),
  service:String(result.input?.service||''),
  location:String(result.input?.location||''),
  customer_value:String(result.input?.customerValue||result.input?.customer_value||''),
  competitors:Array.isArray(result.input?.competitors)?result.input.competitors:[],
  business_name:String(result.business?.name||''),
  mode:String(result.mode||'live'),
  total_score:Number(result.scores?.total||0),
  technical_score:Number(result.scores?.technical?.score||0),
  entity_score:Number(result.scores?.entity?.score||0),
  content_score:Number(result.scores?.content?.score||0),
  authority_score:Number(result.scores?.authority?.score||0),
  discoverability_score:Number(result.scores?.discoverability?.score||0),
  status:'scan_completed',
  report:result
 };

 const {error}=await supabase
  .from('visibility_scans')
  .insert(payload);

 if(error){
  console.error('Supabase insert error:',error);
  throw new Error(`Supabase zapis ni uspel: ${error.message}`);
 }
 return {saved:true,id:null};
}

export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed',version:AXO_SCANNER_VERSION});
 try{
  const input=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
  if(!input.domain||!input.service||!input.location||!input.email)return res.status(400).json({error:'Manjkajo obvezni podatki.'});
  input.competitors=Array.isArray(input.competitors)?input.competitors:[];
  const result=await runScan(input);
  const storage=await saveScanToSupabase(result);
  res.setHeader('Cache-Control','no-store');res.setHeader('X-AXO-Scanner-Version',AXO_SCANNER_VERSION);return res.status(200).json({...result,version:AXO_SCANNER_VERSION,scanId:storage.id||null,storage});
 }catch(e){console.error(e);return res.status(400).json({error:e?.name==='AbortError'?'Spletna stran se ni odzvala dovolj hitro.':(e?.message||'Analiza ni uspela.')});}
}
