import assert from 'node:assert/strict';
import {test} from 'node:test';
import {rendererConnectionPolicy} from '../src/preferences-csp.ts';

const policy="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' http://127.0.0.1:3001 ws://127.0.0.1:3001; base-uri 'none'; form-action 'none'; object-src 'none'";
const index=(content=policy)=>`<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="${content}"></head><body><script src="./assets/main.js"></script></body></html>`;
test('packaged policy replaces only connect-src with the selected exact HTTPS authority and WebSocket peer',()=>{
 const actual=rendererConnectionPolicy(index(),'https://account.example.test:8443');
 assert.equal(actual,index(policy.replace("connect-src 'self' http://127.0.0.1:3001 ws://127.0.0.1:3001","connect-src 'self' https://account.example.test:8443 wss://account.example.test:8443")));
 assert.equal(actual.includes('http://127.0.0.1'),false);assert.equal(actual.includes('https:'+'*'),false);
});
test('loopback profile permits only its exact HTTP/WS origins and preserves unrelated metadata and content',()=>{
 const actual=rendererConnectionPolicy(index(),'http://[::1]:4242/');
 assert.equal(actual,index(policy.replace("connect-src 'self' http://127.0.0.1:3001 ws://127.0.0.1:3001","connect-src 'self' http://[::1]:4242 ws://[::1]:4242")));
});
test('actual Vite escaped apostrophes decode before directive parsing and re-encode safely for either attribute quote',()=>{
 const escaped=index(policy.replaceAll("'",'&#39;'));
 const expected=index(policy.replace("connect-src 'self' http://127.0.0.1:3001 ws://127.0.0.1:3001","connect-src 'self' https://account.example.test wss://account.example.test"));
 assert.equal(rendererConnectionPolicy(escaped,'https://account.example.test'),expected);
 assert.equal(rendererConnectionPolicy(index(policy.replaceAll("'",'&#x27;')),'https://account.example.test'),expected);
 const single=index(policy.replaceAll("'",'&#39;')).replace('content="',"content='").replace('"></head>',"'></head>");
 const result=rendererConnectionPolicy(single,'https://account.example.test');assert.ok(result.includes("content='default-src &#39;none&#39;"));assert.ok(result.includes("connect-src &#39;self&#39; https://account.example.test wss://account.example.test"));
 const withEntities=index(policy+"; report-to &quot;a&amp;b&lt;c&quot;");const preserved=rendererConnectionPolicy(withEntities,'https://account.example.test');assert.ok(preserved.includes('; report-to &quot;a&amp;b&lt;c&quot;'));
});
test('ambiguous/missing policies and URL spelling/token injection fail closed',()=>{
 for(const html of ['<html></html>',index()+index(),index(policy+'; connect-src *'),index(policy.replace("connect-src 'self' http://127.0.0.1:3001 ws://127.0.0.1:3001; ",'')),index().replace('content="default','content="ignored" content="default'),index(policy+'; script-src *')])assert.throws(()=>rendererConnectionPolicy(html,'https://account.example.test'));
 for(const origin of ['http://127.1','https://good.test/path','https://good.test?token=x','https://good.test\\@bad.test','https://good.test;script-src','https://*.test','https://good\ntest'])assert.throws(()=>rendererConnectionPolicy(index(),origin));
});
