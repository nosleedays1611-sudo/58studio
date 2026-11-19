"use strict";
const test=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');const crypto=require('node:crypto');
process.env.ADMIN_USERNAME='paiadmin';process.env.ADMIN_PASSWORD='senha-testes-super-segura';process.env.STUDIO_SHARED_SECRET='a'.repeat(48);process.env.STORE_API_URL='http://localhost:39999';process.env.STUDIO_URL='http://localhost:3100';
const {srv}=require('../server');
let port;test.before(async()=>{await new Promise(r=>srv.listen(0,'127.0.0.1',r));port=srv.address().port});test.after(()=>srv.close());
async function request(p,method='GET',body,headers={}){const r=await fetch('http://127.0.0.1:'+port+p,{method,redirect:'manual',headers:{'X-ILOVE-REQUEST':'1',...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});return r}
test('sem sessao nao mostra painel',async()=>{const r=await request('/');assert.equal(r.status,302);assert.equal(r.headers.get('location'),'/login')});
test('login errado bloqueado',async()=>{const r=await request('/api/studio/login','POST',{username:'paiadmin',password:'errada'});assert.equal(r.status,401)});
test('login valido, sessão e logout com CSRF',async()=>{const r=await request('/api/studio/login','POST',{username:'paiadmin',password:'senha-testes-super-segura'});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0],session=await request('/api/studio/session','GET',null,{Cookie:cookie});const s=await session.json();assert.equal(s.user.role,'admin');const blocked=await request('/api/admin/bootstrap','GET',null,{Cookie:cookie});assert.equal(blocked.status,502);const csrf=await request('/api/studio/logout','POST',null,{Cookie:cookie});assert.equal(csrf.status,403);const out=await request('/api/studio/logout','POST',null,{Cookie:cookie,'X-CSRF-Token':s.csrf});assert.equal(out.status,200)});
test('sem sessao nao consegue acessar API admin',async()=>{const r=await request('/api/admin/bootstrap');assert.equal(r.status,401)});
test('tela de login usa um único HTML com CSS, JS embutidos e CSP seguro',async()=>{
 const r=await request('/login');assert.equal(r.status,200);
 const html=await r.text();
 assert.match(html,/<section id="loginView"/);
 assert.match(html,/Desenvolvido por: seu filho kk/);
 assert.match(html,/id="app"/);
 assert.match(html,/<style>[\s\S]*<\/style>/);
 assert.match(html,/<script nonce="([\w+/=]+)">/);
 assert.doesNotMatch(html,/<script[^>]+src=/i);
 assert.doesNotMatch(html,/<link[^>]+stylesheet/i);
 const nonce=html.match(/<script nonce="([\w+/=]+)">/)[1];
 assert.ok(r.headers.get('content-security-policy').includes("'nonce-"+nonce+"'"));
 assert.ok(!r.headers.get('content-security-policy').includes("script-src 'self' 'unsafe-inline'"));
});
test('página autenticada também usa o mesmo HTML, sem login separado',async()=>{
 const login=await request('/api/studio/login','POST',{username:'paiadmin',password:'senha-testes-super-segura'});
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const r=await request('/','GET',null,{Cookie:cookie});
 assert.equal(r.status,200);
 const html=await r.text();
 assert.match(html,/id="loginView"/);
 assert.match(html,/id="sideNav"/);
 assert.match(html,/window\.startStudioAdmin/);
});
