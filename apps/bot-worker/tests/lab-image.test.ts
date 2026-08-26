import test from"node:test";import assert from"node:assert/strict";import{formatLabImageDraft,validateLabImage}from"../src/lab-image.ts";
test("lab image draft preserves visible source values",()=>{const d=validateLabImage({date:"2026-08-26",laboratory:"Lab",items:[{marker:"Hb",valueText:"150",valueNumeric:150,unit:"г/л",reference:"130-170"}],confidence:.9,warnings:[]});assert.match(formatLabImageDraft(d),/Hb: 150 г\/л/)});
test("empty lab image is rejected",()=>assert.throws(()=>validateLabImage({date:"2026-08-26",laboratory:"",items:[],confidence:1,warnings:[]})));
