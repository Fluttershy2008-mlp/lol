const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const script=fs.readFileSync(__dirname+'/../index.js','utf8');
for(const route of ['native','rn','turbo','late']) {
 const calls=[],cleanup=[],timers=new Map();let available=route!=='late',timerId=0;
 const cache={images:true,emojis:true,stickers:true,cosmetics:true};
 const manager={setFastImageApngEnabled(value){calls.push(value);}};const original=manager.setFastImageApngEnabled;
 const filters={withProps:(...keys)=>mod=>keys.every(k=>k in mod),withName:()=>()=>false};
 const finders={filters,getModules(){return ()=>{};}};
 const patcher={before(target,key,cb){const old=target[key];const wrapped=function(...args){return old.apply(this,cb(args));};target[key]=wrapped;return()=>{if(target[key]===wrapped)target[key]=old;};}};
 const RN=route==='rn'?{NativeModules:{NativeImageManagerModule:manager}}:route==='turbo'?{TurboModuleRegistry:{get(){return manager;}}}:{};
 const valenced={react:{ReactNative:RN},patcher,modules:{finders,native:{getNativeModule(name){if(available&&(route==='native'||route==='late')&&name==='NativeImageManagerModule')return manager;throw Error('not loaded');}}}};
 const factory=vm.runInNewContext('(function(valenced,plugin){return '+script+'\n})',{setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}});
 const plugin=factory(valenced,o=>o).default;plugin.init({jsonStorage:{cache},cleanup(fn){cleanup.push(fn);}});
 if(route==='late'){assert.equal(calls.length,0);available=true;const task=[...timers.values()].find(t=>t.ms===1000);assert.ok(task);task.fn();}
 assert.equal(calls.at(-1),true,route+': enables APNG decoding');
 manager.setFastImageApngEnabled(false);assert.equal(calls.at(-1),true,route+': guards later experiment disable');
 cache.images=false;manager.setFastImageApngEnabled(false);assert.equal(calls.at(-1),false,route+': respects plugin images switch');
 cache.images=true;manager.setFastImageApngEnabled(false);assert.equal(calls.at(-1),true);
 for(const fn of cleanup.reverse())fn();assert.equal(manager.setFastImageApngEnabled,original);assert.equal(calls.at(-1),false,route+': restores last observed Discord setting');assert.equal(timers.size,0);
}
console.log('PASS: Android APNG gate through native/RN/TurboModule/late discovery, initial enable, later experiment override, switch and cleanup.');
