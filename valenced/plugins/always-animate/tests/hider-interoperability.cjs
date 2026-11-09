process.env.PLUGIN_TEST_TARGET='valenced';
const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const {createWorld,FRIEND,BLOCKED,IGNORED,CHANNEL}=require(process.env.HIDER_TEST_HARNESS || (()=>{throw new Error('Set HIDER_TEST_HARNESS to the repository next-harness.cjs path');})());
const script=fs.readFileSync(require('node:path').join(__dirname,'../index.js'),'utf8');
(async()=>{
 for(const first of ['animate','hide'])for(const whitelist of [false,true]) {
  const w=createWorld();const flags=[];const imageManager={setFastImageApngEnabled:v=>flags.push(v)};
  w.U.modules.native.getNativeModule=name=>{if(name==='NativeImageManagerModule')return imageManager;throw Error('not available');};
  w.U.patcher.before=(holder,key,cb)=>w.U.patcher.instead(holder,key,function(args,original){return original.apply(this,cb(args)||args);});
  w.U.patcher.after=(holder,key,cb)=>w.U.patcher.instead(holder,key,function(args,original){return cb(original.apply(this,args));});
  for(const id of [FRIEND,BLOCKED,IGNORED])w.users[id].avatarDecorationData={asset:'a_decoration'};
  const setting={getSetting:()=>false,useSetting:()=>false};w.addModule({AnimateEmoji:setting});
  w.addModule({getCustomEmojiById:id=>({animated:id==='555'})});
  const sent=[];const native={updateRows(ref,data){sent.push(data);return data;},clearRows(){},scrollToBottom(){}};w.addModule(native);
  class ChatManager {constructor(){this.output=[];}createRow(row){this.output.push(row);return row;}}
  w.addModule(ChatManager,'modules/messages/native/renderer/ChatManager.tsx');
  const cleanups=[];const storage={cache:{images:true,emojis:true,stickers:true,cosmetics:true},set(v){Object.assign(this.cache,v);}};
  const factory=vm.runInNewContext('(function(valenced,plugin){return '+script+'\n})',w.host);
  const animate=factory(w.U,o=>o).default;const api={jsonStorage:storage,cleanup:fn=>cleanups.push(fn)};
  let hider;
  const startAnimate=async()=>{animate.init(api);await animate.start(api);};
  const startHide=async()=>{hider=await w.start('hide-blocked-and-ignored-messages',{whitelistEnabled:whitelist,whitelistedIds:[BLOCKED]});};
  if(first==='animate'){await startAnimate();await startHide();}else{await startHide();await startAnimate();}
  const emoji=Object.freeze({type:'customEmoji',id:'555',src:'https://cdn.discordapp.com/emojis/555.webp',frozenSrc:'https://cdn.discordapp.com/emojis/555.png'});
  const row=(id,author,first=true)=>Object.freeze({type:1,id,message:Object.freeze({id,authorId:author,avatarURL:first?'https://cdn.discordapp.com/avatars/'+author+'/static.png':null,avatarDecorationURL:null,isFirst:first,animateEmoji:false,content:Object.freeze([emoji])})});
  const rows=[row('blocked',BLOCKED),row('ignored',IGNORED),row('friend',FRIEND),row('follow-up',FRIEND,false)];
  const manager=new ChatManager();manager.createRow({type:2,content:rows});native.updateRows('chat',{rows:manager.output});
  const result=sent.at(-1).rows;assert.deepEqual(Array.from(result,r=>r.id),whitelist?['blocked','friend','follow-up']:['friend','follow-up']);
  for(const row of result){assert.equal(row.changeType,2);assert.equal(row.message.animateEmoji,true);assert.equal(row.message.content[0].src,'https://cdn.discordapp.com/emojis/555.gif');assert.equal(row.message.content[0].frozenSrc,emoji.frozenSrc);}
  const visible=result.find(r=>r.id==='friend').message;assert.match(visible.avatarDecorationURL,/a_decoration\.png/);
  const follow=result.find(r=>r.id==='follow-up').message;assert.equal(follow.avatarURL,null);assert.equal(follow.avatarDecorationURL,null,'grouped messages cannot acquire floating frames');
  assert.equal(rows[2].message.animateEmoji,false);assert.equal(rows[2].message.content[0].src,emoji.src);
  assert.equal(w.stores.RelationshipStore.isBlocked(BLOCKED),true);assert.equal(w.stores.RelationshipStore.isIgnored(IGNORED),true);assert.equal(setting.getSetting(),true);assert.equal(flags.at(-1),true);
  if(first==='animate'){await w.stop(hider);for(const fn of cleanups.reverse())await fn();}else{for(const fn of cleanups.reverse())await fn();await w.stop(hider);}
  assert.equal(setting.getSetting(),false);assert.equal(w.timers.size,0);assert.deepEqual(w.errors,[]);
 }
 console.log('PASS: actual Valenced HideBlocked beta8 bundle + Always Animate in both load orders; blocked/ignored filtering, whitelist, native group projection, continuation avatar suppression, emoji playback/static fallback, working APNG switch and cleanup.');
})().catch(error=>{console.error(error);process.exitCode=1;});
