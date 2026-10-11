// Read-only HTTP benchmark of a local production build. It never creates an
// order, sends a code/email, uploads files or calls a payment provider.
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const output = process.argv[2] || '/tmp/agayo-load-result.json';
const durationSeconds = Math.max(5, Math.min(60, Number(process.argv[3]) || 10));
const base = 'http://127.0.0.1:3402';
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next','start','--port','3402','--hostname','127.0.0.1'], { env:{...process.env,DATABASE_URL:''},stdio:['ignore','pipe','pipe'] });
let logs='';
const ready = new Promise((resolve,reject)=>{
  const deadline=setTimeout(()=>reject(new Error('Production server startup timed out')),15000);
  server.stdout.on('data',chunk=>{logs+=chunk; if(logs.includes('Ready in')){clearTimeout(deadline);resolve();}});
  server.stderr.on('data',chunk=>{logs+=chunk;});
  server.once('exit',code=>{clearTimeout(deadline);reject(new Error(`Production server exited (${code})`));});
});
const versions={next:JSON.parse(await readFile(new URL('../node_modules/next/package.json',import.meta.url),'utf8')).version,blob:JSON.parse(await readFile(new URL('../node_modules/@vercel/blob/package.json',import.meta.url),'utf8')).version};
const result={environment:'local production build, same machine HTTP client/server',versions,databaseConfigured:false,browser:false,smoke:[],stages:[]};
try {
  await ready;
  for(const [path,expected] of [ ['/','200'], ['/events','200'], ['/gallery','200'], ['/about','200'], ['/legal','200'], ['/legal/offer','200'], ['/legal/privacy','200'], ['/legal/user-agreement','200'], ['/events/agayo-night','200'], ['/events/clubshow','200'], ['/events/summer-01','200'], ['/events/agayo-night/tickets','200'], ['/events/no-such-event','404'], ['/events/agayo-night/checkout','404'], ['/robots.txt','200'], ['/sitemap.xml','200'], ['/api/admin/events','403'], ['/api/admin/about','403'], ['/api/admin/me','404'] ]) {
    const r=await fetch(base+path,{signal:AbortSignal.timeout(15000)}); const body=await r.text();
    assert.equal(String(r.status),expected,`${path}: unexpected status`);
    if(['/events/agayo-night','/events/clubshow','/events/summer-01'].includes(path)) assert.equal(body.includes('/checkout?category='),false,`${path}: archived sale is exposed`);
    if(path==='/') assert.ok(body.includes('agayo-entry-reveal') && body.includes('hero-booking'));
    if(path==='/about') assert.ok(body.includes('about-story') && body.includes('Прожить молодость'));
    if(['/','/events','/gallery','/about','/legal','/legal/offer','/legal/privacy','/legal/user-agreement'].includes(path)) {
      assert.ok(body.includes(`rel="canonical" href="https://www.agayo.ru${path==='/'?'':path}"`),`${path}: incorrect canonical`);
      assert.equal(/AGAYO — AGAYO/.test(body.match(/<title>([^<]*)<\/title>/)?.[1] || ''),false,`${path}: duplicated title suffix`);
    }
    result.smoke.push({path,status:r.status,cacheControl:r.headers.get('cache-control'),title:body.match(/<title>([^<]*)<\/title>/)?.[1],bytes:Buffer.byteLength(body)});
  }
  const scan=await fetch(base+'/api/admin/tickets/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'untrusted-qr-probe-without-session'})});
  assert.equal(scan.status,403,'Unauthenticated scan must fail before touching inventory');
  result.smoke.push({path:'/api/admin/tickets/scan',method:'POST',status:scan.status});
  const aboutSave=await fetch(base+'/api/admin/about',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:{title:'Unauthorized probe'},version:0})});
  assert.equal(aboutSave.status,403,'Unauthenticated page edits must fail before database initialization');
  result.smoke.push({path:'/api/admin/about',method:'PATCH',status:aboutSave.status});
  for(const path of ['/api/orders','/api/promos/validate']) {
    for(const quantity of [1.5,7,'2']) {
      const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({quantity})});
      assert.equal(response.status,400,`${path}: invalid quantity must fail before any DB/payment action`);
      result.smoke.push({path,method:'POST',quantity,status:response.status});
    }
  }
  const paths=['/','/events','/gallery'];
  for(const concurrency of [10,25,50]) {
    const durations=[];let errors=0;let bytes=0;
    const started=performance.now();
    await Promise.all(Array.from({length:concurrency},(_,worker)=>(async()=>{
      for(let request=0;request<5 || performance.now()-started<durationSeconds*1000;request++) {
        const start=performance.now();
        try {
          const r=await fetch(base+paths[(worker+request)%paths.length],{signal:AbortSignal.timeout(10000)});
          const body=await r.arrayBuffer();bytes+=body.byteLength;if(r.status!==200) errors++;
        } catch { errors++; }
        durations.push(performance.now()-start);
      }
    })()));
    durations.sort((a,b)=>a-b);
    const elapsed=(performance.now()-started)/1000;
    const metric={durationTargetSeconds:durationSeconds,concurrency,requests:durations.length,errors,elapsedSeconds:+elapsed.toFixed(3),requestsPerSecond:+(durations.length/elapsed).toFixed(1),p50Ms:+durations[Math.ceil(durations.length*.5)-1].toFixed(1),p95Ms:+durations[Math.ceil(durations.length*.95)-1].toFixed(1),totalBytes:bytes};
    result.stages.push(metric);process.stdout.write(JSON.stringify(metric)+'\n');
    assert.equal(errors,0,'Read-only load test returned errors');
  }
  await writeFile(output,JSON.stringify(result,null,2)+'\n');
  process.stdout.write(`HTTP smoke: ${result.smoke.length} routes passed. Results: ${output}\n`);
} finally { server.kill('SIGTERM'); }
