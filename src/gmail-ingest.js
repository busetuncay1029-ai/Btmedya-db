/* Gmail bridge contract for BTMEDYA.
 * Gmail/MCP credentials stay outside the Worker. A read-only bridge posts
 * cleaned messages with an HMAC signature; the Worker stores provenance and
 * queues only public source URLs for the existing editorial autopilot.
 */

const MAX_BODY = 24000;
const MAX_MESSAGES = 20;
const MAILBOX = 'busetuncay74@gmail.com';

function now(){ return new Date().toISOString(); }
function b64url(bytes){ return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
async function sign(secret,message){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return b64url(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(message)));
}
function clean(s,max=MAX_BODY){ return String(s||'').replace(/\u0000/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim().slice(0,max); }
function urlsFrom(text){
  const found=String(text||'').match(/https?:\/\/[^\s<>"')\]]+/gi)||[];
  return [...new Set(found.map(x=>x.replace(/[.,;:!?]+$/,'')).filter(x=>/^https?:\/\/[^\s]+$/i.test(x)))].slice(0,10);
}
function hostOf(url){ try{return new URL(url).hostname.toLowerCase().replace(/^www\./,'');}catch{return '';}}
function titleOf(subject){
  return clean(String(subject||'Haber').replace(/^(fwd|fw|ilet|re)\s*:\s*/ig,'').trim(),240)||'Gmail haber adayı';
}
function categoryFor(text){
  const s=String(text||'').toLocaleLowerCase('tr-TR');
  if(/spor|futbol|basketbol|voleybol/.test(s)) return 'Spor';
  if(/okul|eğitim|üniversite|öğrenci/.test(s)) return 'Eğitim';
  if(/su|yol|belediye|muhtar|burhaniye|bandırma|edremit|ayvalık|karesi|altıeylül|sındırgı|susurluk|gönen|manyas|erdek|gömeç|havran|ivindi|bigadiç|balya|dursunbey|kepsut|marmara/.test(s)) return 'Yerel';
  if(/fiyat|ekonomi|tarım|zam|ticaret/.test(s)) return 'Ekonomi';
  return 'Yerel';
}
function relevant(text){
  return /balıkesir|balikesir|bandırma|bandirma|burhaniye|edremit|ayvalık|ayvalik|karesi|altıeylül|altieylul|sındırgı|sindirgi|susurluk|gönen|gonen|manyas|erdek|gömeç|gomec|havran|ivindi|bigadiç|bigadic|balya|dursunbey|kepsut|marmara/i.test(String(text||''));
}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}

async function ensure(env){
  if(!env.DB) throw new Error('D1 yapılandırılmadı');
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS gmail_ingest_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, provider_message_id TEXT NOT NULL UNIQUE,
    thread_id TEXT NOT NULL DEFAULT '', mailbox TEXT NOT NULL, sender TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL DEFAULT '', received_at TEXT NOT NULL DEFAULT '', body_text TEXT NOT NULL DEFAULT '',
    source_urls_json TEXT NOT NULL DEFAULT '[]', body_hash TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'received',
    news_slug TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '', processed_at TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`).run().catch(()=>{});
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS news_intelligence (
    id INTEGER PRIMARY KEY AUTOINCREMENT, source_url TEXT NOT NULL UNIQUE, title TEXT NOT NULL DEFAULT '', excerpt TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'Gündem', source_name TEXT NOT NULL DEFAULT '', source_host TEXT NOT NULL DEFAULT '', source_tier TEXT NOT NULL DEFAULT 'discovery',
    score INTEGER NOT NULL DEFAULT 0, risk TEXT NOT NULL DEFAULT '', trend_signal INTEGER NOT NULL DEFAULT 0, commercial_signal INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'new', first_seen_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`).run().catch(()=>{});
}

async function ingest(request,env){
  const secret=String(env.GMAIL_INGEST_SECRET||'');
  if(!secret) return json({ok:false,error:'Gmail ingest secret yapılandırılmadı'},503);
  const timestamp=String(request.headers.get('x-btmedya-timestamp')||'');
  const nonce=String(request.headers.get('x-btmedya-nonce')||'');
  const signature=String(request.headers.get('x-btmedya-signature')||'').replace(/^sha256=/,'');
  const age=Math.abs(Math.floor(Date.now()/1000)-Number(timestamp));
  if(!/^\d+$/.test(timestamp)||!nonce||!signature||!Number.isFinite(age)||age>300) return json({ok:false,error:'Geçersiz veya süresi dolmuş imza'},401);
  const body=await request.text();
  const expected=await sign(secret,`${timestamp}.${nonce}.${body}`);
  if(expected!==signature) return json({ok:false,error:'İmza doğrulanamadı'},401);
  if(env.KV){ const key=`gmail-ingest:nonce:${nonce}`; if(await env.KV.get(key)) return json({ok:false,error:'Tekrar oynatma isteği'},409); await env.KV.put(key,'1',{expirationTtl:600}); }
  let payload; try{payload=JSON.parse(body);}catch{return json({ok:false,error:'JSON gövdesi geçersiz'},400);}
  const messages=Array.isArray(payload)?payload:(Array.isArray(payload.messages)?payload.messages:[payload]);
  if(messages.length>MAX_MESSAGES) return json({ok:false,error:`Tek seferde en fazla ${MAX_MESSAGES} ileti`},413);
  await ensure(env);
  const result={ok:true,received:0,duplicate:0,queued:0,needs_source:0,ignored:0,items:[]};
  for(const raw of messages){
    const providerId=clean(raw.provider_message_id||raw.message_id||raw.id,180);
    if(!providerId){result.ignored++;continue;}
    const mailbox=clean(raw.mailbox||MAILBOX,320).toLowerCase();
    if(mailbox!==MAILBOX){result.ignored++;result.items.push({provider_message_id:providerId,status:'wrong_mailbox'});continue;}
    const subject=titleOf(raw.subject);
    const bodyText=clean(raw.body_text||raw.text||raw.body,MAX_BODY);
    const combined=`${subject}\n${bodyText}`;
    if(!relevant(combined)){result.ignored++;result.items.push({provider_message_id:providerId,status:'not_balikesir'});continue;}
    const urls=[...(Array.isArray(raw.source_urls)?raw.source_urls:[]),...urlsFrom(bodyText)].map(String).filter(x=>/^https?:\/\//i.test(x));
    const uniqueUrls=[...new Set(urls)].slice(0,10);
    const receivedAt=clean(raw.received_at||raw.date||now(),64);
    const createdAt=now();
    const inserted=await env.DB.prepare(`INSERT OR IGNORE INTO gmail_ingest_messages
      (provider_message_id,thread_id,mailbox,sender,subject,received_at,body_text,source_urls_json,body_hash,status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(providerId,clean(raw.thread_id,180),mailbox,clean(raw.sender,320),subject,receivedAt,bodyText,JSON.stringify(uniqueUrls),await sign(secret,bodyText),uniqueUrls.length?'received':'needs_source',createdAt,createdAt).run();
    if(!inserted?.meta?.changes){result.duplicate++;continue;}
    result.received++;
    if(!uniqueUrls.length){result.needs_source++;result.items.push({provider_message_id:providerId,status:'needs_source'});continue;}
    const sourceUrl=uniqueUrls[0];
    const category=categoryFor(combined);
    const score=Math.min(96,Math.max(62,72+(relevant(combined)?14:0)+(uniqueUrls.length>1?4:0)));
    const intel=await env.DB.prepare(`INSERT OR IGNORE INTO news_intelligence
      (source_url,title,excerpt,category,source_name,source_host,source_tier,score,risk,trend_signal,commercial_signal,status,first_seen_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(sourceUrl,subject,bodyText.slice(0,1800),category,'Gmail / '+MAILBOX,hostOf(sourceUrl),'gmail',score,'Gmail içeriği editör doğrulaması bekliyor',0,0,'new',receivedAt,createdAt).run().catch(()=>null);
    const queued=Boolean(intel?.meta?.changes);
    await env.DB.prepare('UPDATE gmail_ingest_messages SET status=?,processed_at=?,updated_at=? WHERE provider_message_id=?').bind(queued?'queued':'duplicate_source',createdAt,createdAt,providerId).run();
    if(queued) result.queued++; else result.duplicate++;
    result.items.push({provider_message_id:providerId,status:queued?'queued':'duplicate_source',source_url:sourceUrl});
  }
  return json(result,200);
}

export async function gmailIntegrationApi(request,env,url,isAdmin=false){
  if(url.pathname==='/api/integrations/gmail/news' && request.method==='POST') return ingest(request,env);
  if(url.pathname==='/api/admin/gmail/messages' && request.method==='GET'){
    if(!isAdmin) return json({ok:false,error:'Yetkisiz'},401);
    await ensure(env);
    const status=String(url.searchParams.get('status')||'').trim();
    const q=status?await env.DB.prepare(`SELECT id,provider_message_id,thread_id,mailbox,sender,subject,received_at,source_urls_json,status,news_slug,error,processed_at,created_at,updated_at FROM gmail_ingest_messages WHERE status=? ORDER BY received_at DESC LIMIT 100`).bind(status).all():await env.DB.prepare(`SELECT id,provider_message_id,thread_id,mailbox,sender,subject,received_at,source_urls_json,status,news_slug,error,processed_at,created_at,updated_at FROM gmail_ingest_messages ORDER BY received_at DESC LIMIT 100`).all();
    return json({ok:true,items:q.results||[],mailbox:MAILBOX});
  }
  return null;
}
