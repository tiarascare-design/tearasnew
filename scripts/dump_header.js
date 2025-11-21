const puppeteer = require('puppeteer');
(async()=>{
	const b=await puppeteer.launch({headless:true,args:['--no-sandbox']});
	const p=await b.newPage();
	await p.goto('http://localhost:5500/?useProd=1',{waitUntil:'networkidle2'});
	await p.waitForSelector('#main-header', { timeout: 5000 }).catch(()=>{});
	const h=await p.evaluate(()=>{
		const el=document.getElementById('main-header');
		if(!el) return 'noheader';
		return Array.from(el.querySelectorAll('a,button')).map(n=>({tag:n.tagName,text:n.textContent.trim().slice(0,60),data: n.dataset? {...n.dataset} : {}, cls: n.className.slice(0,200)}));
	});
	// Also log the full innerHTML length for debugging
	const inner = await p.evaluate(()=>{ const el=document.getElementById('main-header'); return el ? el.innerHTML : null; });
	console.log('elements:', h);
	console.log('inner length', inner ? inner.length : null);
	if (inner) console.log(inner.slice(0,1200));
	await b.close();
	process.exit(0);
})();