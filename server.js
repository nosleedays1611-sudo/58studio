"use strict";
// ILOVEBR58 Studio separado. Node.js 22+. Somente proxy servidor-servidor acessa API admin.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const ROOT=__dirname;
function env(){const p=path.join(ROOT,'.env');if(!fs.existsSync(p))return;for(const line of fs.readFileSync(p,'utf8').split(/\r?\n/)){let s=line.trim();if(!s||s.startsWith('#'))continue;const i=s.indexOf('=');if(i<=0)continue;const k=s.slice(0,i).trim(),v=s.slice(i+1).trim().replace(/^(['"])(.*)\1$/,'$2');if(!(k in process.env))process.env[k]=v}}
env();
const PORT=Number(process.env.PORT||3100);
const USER=String(process.env.ADMIN_USERNAME||'');
const PASS=String(process.env.ADMIN_PASSWORD||'');
const BRIDGE=String(process.env.STUDIO_SHARED_SECRET||'');
const PUBLIC=path.join(ROOT,'public');
const live=process.env.NODE_ENV==='production';
const SITE_URL=String(process.env.STUDIO_URL||`http://localhost:${PORT}`).replace(/\/$/,'');
const SHOP=String(process.env.STORE_API_URL||'').replace(/\/$/,'');
function origin(raw){try{const u=new URL(raw);return u.origin===raw&&['http:','https:'].includes(u.protocol)}catch{return false}}
if(!USER||PASS.length<12||BRIDGE.length<32||!origin(SITE_URL)||!origin(SHOP))throw Error('Configure ADMIN_USERNAME, ADMIN_PASSWORD (12+), STUDIO_SHARED_SECRET (32+), STUDIO_URL e STORE_API_URL no ambiente.');
if(live && (!SITE_URL.startsWith('https://')||!SHOP.startsWith('https://')))throw Error('Produção requer HTTPS no Studio e na loja.');
const SESSION_COOKIE=live?'__Host-ilove_studio':'ilove_studio';
const sessions=new Map(),attempts=new Map();
const now=()=>Date.now();
function answer(res,code,data,extra={}){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});res.end(JSON.stringify(data))}
function fail(m,c=400){return Object.assign(new Error(m),{code:c})}
function cookies(req){const found=String(req.headers.cookie||'').split(';').map(x=>x.trim().split('='));return found.find(x=>x[0]===SESSION_COOKIE)?.[1]||''}
function getSession(req){const cookie=cookies(req);if(!/^[a-f\d]{64}$/.test(cookie))return null;const s=sessions.get(crypto.createHash('sha256').update(cookie).digest('hex'));if(!s)return null;if(s.expires<=now()){sessions.delete(s.id);return null}return s}
function session(req){const s=getSession(req);if(!s)throw fail('Sessão expirada. Entre novamente.',401);return s}
function secureCookie(value,age){return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}`+(live?'; Secure':'')}
function compare(a,b){const ah=crypto.createHash('sha256').update(String(a)).digest(),bh=crypto.createHash('sha256').update(String(b)).digest();return crypto.timingSafeEqual(ah,bh)}
function browserOrigin(req){const o=req.headers.origin; if(o&&o!==SITE_URL)throw fail('Origem não autorizada.',403); const s=req.headers['sec-fetch-site'];if(s==='cross-site')throw fail('Requisição externa não autorizada.',403); if(req.headers['x-ilove-request']!=='1')throw fail('Cabeçalho obrigatório.',403)}
async function read(req,max=6_600_000){let size=0,buf=[];for await(const chunk of req){size+=chunk.length;if(size>max)throw fail('Arquivo muito grande.',413);buf.push(chunk)}return Buffer.concat(buf)}
function badLogin(ip){const previous=attempts.get(ip);const x=previous&&previous.until>now()?previous:{count:0,until:now()+900000};x.count++;attempts.set(ip,x);if(attempts.size>30000)attempts.clear()}
function loginLimit(ip){const x=attempts.get(ip);if(x&&x.until>now()&&x.count>=7)throw fail('Muitas tentativas. Aguarde 15 minutos.',429);if(x&&x.until<=now())attempts.delete(ip)}
const extensions={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
function headers(mime){return {'Content-Type':mime,'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Cache-Control':'no-cache','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'"}}
async function staticFile(req,res,name){const file=path.join(PUBLIC,name);if(!file.startsWith(PUBLIC+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())throw fail('Não encontrado.',404);res.writeHead(200,headers(extensions[path.extname(name)]||'application/octet-stream'));if(req.method==='HEAD')return res.end();fs.createReadStream(file).pipe(res)}
async function studioPage(req,res){
 const nonce=crypto.randomBytes(18).toString('base64');
 const content=fs.readFileSync(path.join(PUBLIC,'index.html'),'utf8').replaceAll('__STUDIO_NONCE__',nonce);
 const extra=headers('text/html; charset=utf-8');
 extra['Content-Security-Policy']=extra['Content-Security-Policy'].replace("script-src 'self'",`script-src 'self' 'nonce-${nonce}'`);
 extra['Cache-Control']='no-store';
 res.writeHead(200,extra);
 res.end(req.method==='HEAD'?'':content);
}
async function proxyApi(req,res,u){const s=session(req);browserOrigin(req);if(!['GET','POST','PATCH','DELETE'].includes(req.method))throw fail('Método não aceito.',405);if(!['GET'].includes(req.method)&&req.headers['x-csrf-token']!==s.csrf)throw fail('Sessão inválida (CSRF).',403);
 const body=['POST','PATCH'].includes(req.method)?await read(req):undefined;
 if(body && req.headers['content-type']?.split(';')[0]!=='application/json')throw fail('Tipo de conteúdo inválido.',415);
 const target=SHOP+u.pathname+u.search;
 let response;try{response=await fetch(target,{method:req.method,headers:{'Accept':'application/json','Content-Type':'application/json','X-ILOVE-STUDIO-SECRET':BRIDGE},body,signal:AbortSignal.timeout(20000)})}catch{throw fail('Não foi possível conectar à API da loja. Confira STORE_API_URL e a hospedagem.',502)}
 const raw=await response.text();res.writeHead(response.status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(raw);
}
async function proxyMedia(req,res,pathName){session(req);const target=SHOP+pathName;let r;try{r=await fetch(target,{signal:AbortSignal.timeout(12000)})}catch{throw fail('Imagem indisponível.',502)}if(!r.ok)throw fail('Imagem indisponível.',r.status);const mime=r.headers.get('content-type')||'image/webp';if(!/^image\/(webp|png|jpeg|gif)$/.test(mime))throw fail('Imagem inválida.',502);res.writeHead(200,{'Content-Type':mime,'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'});if(req.method==='HEAD')return res.end();res.end(Buffer.from(await r.arrayBuffer()))}
const srv=http.createServer(async(req,res)=>{try{const u=new URL(req.url,SITE_URL),p=u.pathname;
 if(p==='/api/studio/login'&&req.method==='POST'){browserOrigin(req);const ip=req.socket.remoteAddress||'unknown';loginLimit(ip);if(req.headers['content-type']?.split(';')[0]!=='application/json')throw fail('Formato inválido.',415);const b=JSON.parse((await read(req,10_000)).toString('utf8')||'{}');if(!compare(b.username,USER)||!compare(b.password,PASS)){badLogin(ip);throw fail('Usuário ou senha incorretos.',401)}attempts.delete(ip);const token=crypto.randomBytes(32).toString('hex'),id=crypto.createHash('sha256').update(token).digest('hex'),csrf=crypto.randomBytes(24).toString('hex');sessions.set(id,{id,csrf,expires:now()+8*3600e3});answer(res,200,{ok:true},{'Set-Cookie':secureCookie(token,8*3600)});return}
 if(p==='/api/studio/session'&&req.method==='GET'){const s=getSession(req);return answer(res,200,{user:s?{name:USER,email:'',role:'admin'}:null,csrf:s?.csrf||null})}
 if(p==='/api/studio/logout'&&req.method==='POST'){const s=session(req);browserOrigin(req);if(req.headers['x-csrf-token']!==s.csrf)throw fail('Token inválido.',403);sessions.delete(s.id);return answer(res,200,{ok:true},{'Set-Cookie':secureCookie('',0)})}
 if(p==='/api/studio/health'&&req.method==='GET')return answer(res,200,{ok:true,service:'ILOVEBR58-STUDIO'});
 if(p.startsWith('/api/admin/'))return await proxyApi(req,res,u);
 if(/^\/media\/[0-9a-f-]{36}\.(?:png|jpg|webp|gif)$/.test(p)&&['GET','HEAD'].includes(req.method))return await proxyMedia(req,res,p);
 if(['GET','HEAD'].includes(req.method)){
  if(p==='/'||p==='/index.html'){if(!getSession(req)){res.writeHead(302,{Location:'/login','Cache-Control':'no-store'});return res.end()}return studioPage(req,res)}
  if(p==='/login'||p==='/login.html'){if(getSession(req)){res.writeHead(302,{Location:'/','Cache-Control':'no-store'});return res.end()}return studioPage(req,res)}
  if(/^\/(?:css|js|assets)\/[\w./-]+$/.test(p)&&!p.includes('..'))return staticFile(req,res,p.slice(1));
 }
 throw fail('Página não encontrada.',404)
 }catch(e){if(e.code>=500)console.error('[STUDIO]',e.message);answer(res,e.code||500,{error:e.code?e.message:'Erro interno.'})}});
if(require.main===module)srv.listen(PORT,()=>console.log(`ILOVEBR58 Studio pronto na porta ${PORT}`));
module.exports={srv};
