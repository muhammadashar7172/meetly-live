import {db,ref,child,onChildAdded,onChildChanged,onChildRemoved,onValue,set,update,remove,push,onDisconnect} from './firebase';

/**
 * Firebase Realtime Database signaling.
 *
 * Replaces the Socket.IO server so the app needs NO backend process:
 *   rooms/{code}/peers/{id}      -> {name, joinedAt, sharing}  (presence, auto-removed on disconnect)
 *   rooms/{code}/signals/{toId}  -> {from, payload}    (WebRTC offer/answer/ICE)
 *   rooms/{code}/chat/{id}       -> message
 *   rooms/{code}/draw/{id}       -> whiteboard stroke
 *   rooms/{code}/clear/{id}      -> whiteboard clear
 *
 * `sharing` on a peer means that peer is presenting their screen, so every
 * client can give the presenter the whole stage.
 *
 * The room node is deleted automatically once it becomes empty.
 *
 * NOTE: ref() only accepts the Database as its first argument — nested paths
 * must be built with child(parentRef, path).
 */
export function createSignaling({room,name,id,joinedAt,handlers={}}){
  const base=ref(db,`rooms/${room}`);
  const peersRef=child(base,'peers');
  const myPeerRef=child(peersRef,id);
  const mySignalsRef=child(base,`signals/${id}`);
  const chatRef=child(base,'chat');
  const drawRef=child(base,'draw');
  const clearRef=child(base,'clear');
  const unsub=[];
  const knownPeers=new Set([id]);

  /* presence — server removes us even if the browser crashes */
  set(myPeerRef,{name,joinedAt,sharing:false})
    .then(()=>onDisconnect(myPeerRef).remove())
    .catch(e=>console.warn('presence write failed',e));

  /* who is in the room */
  unsub.push(onChildAdded(peersRef,snap=>{
    if(snap.key===id)return;
    knownPeers.add(snap.key);
    const v=snap.val()||{};
    handlers.onPeerJoin?.({id:snap.key,name:v.name,joinedAt:v.joinedAt||0,sharing:!!v.sharing});
  }));
  /* a peer started/stopped presenting their screen */
  unsub.push(onChildChanged(peersRef,snap=>{
    if(snap.key===id)return;
    const v=snap.val()||{};
    handlers.onPeerChange?.({id:snap.key,name:v.name,joinedAt:v.joinedAt||0,sharing:!!v.sharing});
  }));
  unsub.push(onChildRemoved(peersRef,snap=>{
    if(snap.key===id)return;
    knownPeers.delete(snap.key);
    handlers.onPeerLeave?.({id:snap.key});
  }));

  /* incoming WebRTC signals, consumed after delivery */
  unsub.push(onChildAdded(mySignalsRef,snap=>{
    const v=snap.val();
    remove(snap.ref).catch(()=>{});
    if(!v)return;
    handlers.onSignal?.({from:v.from,payload:v.payload});
  }));

  /* chat (own messages are skipped — the sender already rendered them locally) */
  unsub.push(onChildAdded(chatRef,snap=>{
    const v=snap.val();
    if(!v||v.from===id)return;
    handlers.onChat?.(v);
  }));

  /* whiteboard */
  unsub.push(onChildAdded(drawRef,snap=>{
    const v=snap.val();
    if(!v||v.from===id)return;
    handlers.onDraw?.(v);
  }));
  unsub.push(onChildAdded(clearRef,snap=>{
    const v=snap.val();
    if(!v||v.from===id)return;
    handlers.onDrawClear?.();
  }));

  /* tidy up: delete the room when nobody is left in it */
  let firstSnapshot=true;
  unsub.push(onValue(peersRef,snap=>{
    if(firstSnapshot){firstSnapshot=false;return;}
    if(!snap.exists())remove(base).catch(()=>{});
  }));

  return {
    id,
    joinedAt,
    sendSignal(to,payload){
      if(!to)return;
      /* RTCSessionDescription/RTCIceCandidate have no own enumerable keys —
         Firebase would serialize them to nothing, so convert to plain JSON first. */
      let data=payload;
      try{data=JSON.parse(JSON.stringify(payload));}catch(e){data=undefined;}
      if(!data)return;
      push(child(base,`signals/${to}`),{from:id,payload:data,ts:Date.now()}).catch(e=>console.warn('signal write failed',e));
    },
    sendChat(msg){
      push(chatRef,{...msg,from:id,ts:Date.now()}).catch(()=>{});
    },
    sendDraw(d){
      push(drawRef,{...d,from:id,ts:Date.now()}).catch(()=>{});
    },
    sendClear(){
      push(clearRef,{from:id,ts:Date.now()}).catch(()=>{});
    },
    /* broadcast that we are (or are not) presenting our screen */
    setSharing(on){
      update(myPeerRef,{sharing:!!on}).catch(e=>console.warn('sharing flag failed',e));
    },
    leave(){
      /* remove ourselves FIRST, then watch briefly for the room emptying out
         (if we unsubscribe first, nobody is left to observe the empty room) */
      const finish=()=>{unsub.forEach(fn=>{try{fn();}catch(e){}});};
      if(knownPeers.size<=1){
        remove(base).catch(()=>{}).finally(finish);
        return;
      }
      remove(myPeerRef).catch(()=>{});
      let watch=null;
      try{
        watch=onValue(peersRef,snap=>{
          if(!snap.exists()){
            try{watch&&watch();}catch(e){}
            remove(base).catch(()=>{});
            finish();
          }
        });
      }catch(e){}
      /* stop watching after a short grace period so we don't leak listeners */
      setTimeout(()=>{try{watch&&watch();}catch(e){}finish();},5000);
    }
  };
}
