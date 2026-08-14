// Concurrent load tester for /api/signals
const TARGET = process.env.TARGET_URL || 'http://localhost:3000/api/signals';
const TOTAL = Number(process.env.REQUESTS) || 200;
const CONCURRENCY = Number(process.env.CONCURRENCY) || 20;

async function doRequest(i){
  try{
    const res = await fetch(TARGET, {cache:'no-store'});
    const text = await res.text();
    return {i, status: res.status, len: text.length};
  }catch(e){
    return {i, error: String(e)};
  }
}

async function run(){
  console.log(`Running ${TOTAL} requests with concurrency ${CONCURRENCY} -> ${TARGET}`);
  const results = [];
  let inFlight = 0;
  let idx = 0;

  async function spawn(){
    while(idx < TOTAL){
      if(inFlight >= CONCURRENCY) {
        await new Promise(r=>setTimeout(r,10));
        continue;
      }
      const cur = idx++;
      inFlight++;
      doRequest(cur).then(r=>{ results.push(r); inFlight--; });
    }
    // wait for remaining
    while(inFlight>0) await new Promise(r=>setTimeout(r,50));
  }

  await spawn();
  const summary = results.reduce((acc,r)=>{
    if(r.error) acc.err++;
    else if(r.status===200) acc.ok++;
    else if(r.status===429) acc.rl++;
    else acc.other++;
    return acc;
  }, {ok:0, rl:0, err:0, other:0});
  console.log('SUMMARY', summary);
}

run().catch(e=>{ console.error(e); process.exit(1); });
