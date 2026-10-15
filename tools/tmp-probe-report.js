'use strict';
const B = require('/home/user/.workspace/projects/tabaani/tools/browser');
const LIVE = 'https://abdmmm2.github.io/tabaani/app/';
(async () => {
  const chrome = await B.launch();
  const page = await B.openPage(chrome.port, { width: 1300, height: 900 });
  await B.goto(page, LIVE, '!!window.Store'); await B.sleep(2200);
  await page.eval('try{localStorage.clear();}catch(e){} return true;');
  await B.goto(page, LIVE, '!!window.Store'); await B.sleep(1800);
  await page.eval('Store.setupOwner({demo:true,username:"rev1",name:"مراجع",password:"Tabaani@2026"}); return true;');
  await B.goto(page, LIVE, '!!window.Store'); await B.sleep(1500);
  await page.eval('App.openLogin(); return true;'); await B.sleep(700);
  await page.eval('document.querySelector("[name=username]").value="rev1";document.querySelector("[name=password]").value="Tabaani@2026";document.querySelector("form button[type=submit]").click(); return true;');
  await B.sleep(2200);
  console.log('shell:', await page.eval('return document.querySelectorAll(".side-nav a[data-mod]").length;'));
  if (!(await page.eval('return document.querySelectorAll(".side-nav a[data-mod]").length;'))) {
    console.log('body:', String(await page.eval('return document.body.innerText.slice(0,200).replace(/\\n/g," | ");')));
    console.log('otp?', await page.eval('return !!document.querySelector("[name=otpCode]");'));
    console.log('err:', JSON.stringify(await page.eval('return (window.__E2E.errors||[]).slice(0,3);')));
  }
  await page.eval('App.go("schools"); return true;'); await B.sleep(1200);
  const info = await page.eval(
    'var v=document.querySelector("#view");' +
    'var btns=[].slice.call(v.querySelectorAll("button"));' +
    'return { panel:v.innerText.slice(0,80).replace(/\\n/g," | "),' +
    ' soft:btns.filter(function(b){return b.className.indexOf("btn-soft")>-1;}).map(function(b){return b.innerText.trim();}).slice(0,4),' +
    ' all:btns.map(function(b){return b.innerText.trim().slice(0,22);}).slice(0,10) };');
  console.log('panel:', info.panel);
  console.log('btn-soft:', JSON.stringify(info.soft));
  console.log('buttons:', JSON.stringify(info.all));
  const r = await page.eval(
    'window.__E2E.errors.length=0;' +
    'var v=document.querySelector("#view");' +
    'var b=[].slice.call(v.querySelectorAll("button")).filter(function(x){return x.innerText.indexOf("طباعة التقرير")>-1;})[0];' +
    'if(!b) return "NO_BUTTON"; b.click(); return "CLICKED:" + b.innerText.replace(/\\n/g," ");');
  console.log('click:', r);
  await B.sleep(1500);
  const after = await page.eval(
    'var f=document.getElementById("print-frame");' +
    'return { frame:!!f, len:f&&f.contentDocument?f.contentDocument.documentElement.innerHTML.length:0,' +
    ' title:f&&f.contentDocument?f.contentDocument.title:"",' +
    ' hasSchool:f&&f.contentDocument?/مدرسة|المدارس/.test(f.contentDocument.body.innerText):false,' +
    ' errors:(window.__E2E.errors||[]).slice(0,3) };');
  console.log('after:', JSON.stringify(after));
  await B.sleep(500);
  console.log('errors:', JSON.stringify(await page.eval('return (window.__E2E.errors||[]).slice(0,5);')));
  page.close(); chrome.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
