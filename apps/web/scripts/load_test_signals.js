// Simple load tester for /api/signals to exercise rate limiting
const url = process.env.TARGET_URL || 'http://localhost:3000/api/signals';
const requests = Number(process.env.REQUESTS) || 20;
const delayMs = Number(process.env.DELAY_MS) || 200;

async function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function run(){
  console.log(`Testing ${requests} requests -> ${url}`);
  let ok = 0, rl = 0, err = 0;
  for(let i=0;i<requests;i++){
    try{
      const res = await fetch(url, {cache: 'no-store'});
      const status = res.status;
      if(status===200){ ok++; }
      else if(status===429){ rl++; }
      else { err++; }
      const txt = await res.text();
      console.log(`#${i+1} ${status} ${txt.length} bytes`);
    }catch(e){ err++; console.log(`#${i+1} ERROR ${String(e)}`); }
    await sleep(delayMs);
  }
  console.log('RESULTS', {ok, rl, err});
}

run().catch(e=>{ console.error(e); process.exit(1); });
