import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createSignaling} from './signaling';
import {Video,VideoOff,Mic,MicOff,MonitorUp,MonitorOff,PhoneOff,Users,MessageCircle,PenTool,Eraser,Trash2,Copy,Check,Send,Shield,Plus,Link2,Maximize2,Minimize2,ChevronRight,Camera,Share2,X} from 'lucide-react';
import './style.css';

/* ---------- quality config: Full HD video + crystal clear voice ---------- */
const ice={iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]};
const CAM_CONSTRAINTS={width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:30,max:60}};
const MIC_CONSTRAINTS={echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:2};
const SCREEN_CONSTRAINTS={video:{width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:30,max:60},cursor:'always'},audio:true};
const VIDEO_BITRATE=6000000; // 6 Mbps => crisp 1080p / full-HD screen share
const AUDIO_BITRATE=128000;  // 128 kbps opus => clear voice
const PEN_COLORS=['#ffd666','#ffffff','#5ee08a','#58a6ff','#ff6b81'];

function App(){
  const [name,setName]=useState('');
  const [room,setRoom]=useState('');
  const [inRoom,setInRoom]=useState(false);
  const [localStream,setLocalStream]=useState(null);
  const [camOn,setCamOn]=useState(true);
  const [micOn,setMicOn]=useState(true);
  const [sharing,setSharing]=useState(false);
  const [screenStream,setScreenStream]=useState(null);
  const [drawing,setDrawing]=useState(false);
  const [penColor,setPenColor]=useState(PEN_COLORS[0]);
  const [penSize,setPenSize]=useState(4);
  const [eraser,setEraser]=useState(false);
  const [participants,setParticipants]=useState([]);
  const [messages,setMessages]=useState([]);
  const [chatText,setChatText]=useState('');
  const [copied,setCopied]=useState(false);
  const [activeTab,setActiveTab]=useState('chat');
  const [roomCode,setRoomCode]=useState('');
  const [fullScreen,setFullScreen]=useState(false);
  const [connecting,setConnecting]=useState(false);
  const [shareOpen,setShareOpen]=useState(false);

  const sigRef=useRef(null), pcs=useRef({}), streams=useRef({}), pendingIce=useRef({});
  const localVideo=useRef(null), selfVideo=useRef(null), canvasRef=useRef(null);
  const drawState=useRef(null), chatEnd=useRef(null), screenTrack=useRef(null);
  const baseStream=useRef(null), screenAudio=useRef(null), myId=useRef('');

  const codeGen=()=>Math.random().toString(36).slice(2,8).toUpperCase();
  const inviteUrl=roomCode?`${location.origin}${location.pathname}?room=${roomCode}`:location.origin;

  /* local preview: screen while sharing, camera otherwise */
  useEffect(()=>{if(localVideo.current)localVideo.current.srcObject=sharing&&screenStream?screenStream:localStream},[localStream,sharing,screenStream]);
  /* floating self-view (camera) while your screen is shared */
  useEffect(()=>{if(selfVideo.current)selfVideo.current.srcObject=!sharing?null:baseStream.current},[sharing,inRoom]);
  useEffect(()=>{chatEnd.current?.scrollIntoView({behavior:'smooth'})},[messages]);
  useEffect(()=>{const h=()=>setFullScreen(!!document.fullscreenElement);document.addEventListener('fullscreenchange',h);return()=>document.removeEventListener('fullscreenchange',h)},[]);

  function addParticipant(id,n,stream){
    setParticipants(prev=>{
      const exist=prev.find(p=>p.id===id);
      if(exist)return prev.map(p=>p.id===id?{...p,name:n||p.name,stream:stream||p.stream}:p);
      return [...prev,{id,name:n||'Guest',stream}];
    });
  }
  function removePeer(id){
    pcs.current[id]?.close();delete pcs.current[id];delete streams.current[id];delete pendingIce.current[id];
    setParticipants(p=>p.filter(x=>x.id!==id));
  }
  function sendSignal(to,payload){sigRef.current?.sendSignal(to,payload);}
  const polite=from=>String(myId.current)>String(from); // perfect negotiation (avoids offer collisions)

  /* bitrate + encoding tuning => full HD video & clear voice */
  async function applyQuality(pc){
    for(const s of pc.getSenders()){
      if(!s.track)continue;
      try{
        const p=s.getParameters();
        if(!p.encodings||!p.encodings.length)p.encodings=[{}];
        p.encodings[0].maxBitrate=s.track.kind==='video'?VIDEO_BITRATE:AUDIO_BITRATE;
        if(s.track.kind==='video'){p.encodings[0].maxFramerate=30;try{p.degradationPreference='maintain-framerate'}catch(e){}}
        await s.setParameters(p);
      }catch(e){/* ignored */}
    }
  }

  function createPC(peerId,initiator){
    if(pcs.current[peerId])return pcs.current[peerId];
    const pc=new RTCPeerConnection(ice);pcs.current[peerId]=pc;pendingIce.current[peerId]=[];
    pc._makingOffer=false;
    if(baseStream.current)baseStream.current.getTracks().forEach(t=>{try{pc.addTrack(t,baseStream.current)}catch(e){}});
    /* if we have no camera/mic, still be ready to receive others */
    if(!baseStream.current?.getVideoTracks().length){try{pc.addTransceiver('video',{direction:'recvonly'})}catch(e){}}
    if(!baseStream.current?.getAudioTracks().length){try{pc.addTransceiver('audio',{direction:'recvonly'})}catch(e){}}
    pc.onicecandidate=e=>{if(e.candidate)sendSignal(peerId,{candidate:e.candidate})};
    pc.ontrack=e=>{const st=e.streams[0];streams.current[peerId]=st;setParticipants(prev=>prev.map(p=>p.id===peerId?{...p,stream:st}:p));};
    pc.onnegotiationneeded=()=>negotiate(peerId);
    if(initiator)negotiate(peerId);
    applyQuality(pc);
    return pc;
  }

  async function negotiate(peerId){
    const pc=pcs.current[peerId];if(!pc)return;
    if(pc.signalingState!=='stable'||pc._makingOffer)return;
    pc._makingOffer=true;
    try{
      const offer=await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal(peerId,{description:pc.localDescription});
    }catch(err){console.warn('Negotiation',err);}
    pc._makingOffer=false;
    applyQuality(pc);
  }

  async function handleSignal(from,payload){
    const pc=pcs.current[from]||createPC(from,false);
    try{
      if(payload.description){
        const desc=payload.description;
        if(desc.type==='offer'&&pc.signalingState!=='stable'){
          if(!polite(from))return;              // impolite peer ignores colliding offer
          try{await pc.setLocalDescription({type:'rollback'});}catch(e){}
        }
        await pc.setRemoteDescription(desc);
        const q=pendingIce.current[from]||[];pendingIce.current[from]=[];
        for(const c of q){try{await pc.addIceCandidate(c)}catch(e){}}
        if(desc.type==='offer'){
          const answer=await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal(from,{description:pc.localDescription});
        }
        applyQuality(pc);
      }else if(payload.candidate){
        if(!pc.remoteDescription)(pendingIce.current[from] ||= []).push(payload.candidate);
        else await pc.addIceCandidate(payload.candidate);
      }
    }catch(e){console.error('Signal error',e);}
  }

  async function joinMeeting(forced,isNew){
    if(!name.trim()){alert('Please enter your name first.');return;}
    const hadCode=(typeof forced==='string'?forced:room).trim().length>0;
    const code=(typeof forced==='string'?forced:room).trim().toUpperCase()||codeGen();
    const created=!hadCode||isNew; // auto-show invite only for a brand-new meeting
    setRoomCode(code);setConnecting(true);

    /* Full HD camera + clear mic */
    let media=null;
    try{media=await navigator.mediaDevices.getUserMedia({video:CAM_CONSTRAINTS,audio:MIC_CONSTRAINTS});}
    catch(err){try{media=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720}},audio:MIC_CONSTRAINTS});}
      catch(e){try{media=await navigator.mediaDevices.getUserMedia({video:false,audio:MIC_CONSTRAINTS});}catch(x){media=null;}}}
    baseStream.current=media;setLocalStream(media);
    setCamOn(!!media?.getVideoTracks().length);setMicOn(!!media?.getAudioTracks().length);

    /* --- Firebase Realtime Database signaling (no server needed) --- */
    const peerId=Math.random().toString(36).slice(2,10)+Date.now().toString(36);
    const joinedAt=Date.now();
    myId.current=peerId;
    const sig=createSignaling({
      room:code,name:name.trim(),id:peerId,joinedAt,
      handlers:{
        onPeerJoin:p=>{
          addParticipant(p.id,p.name);
          /* the peer who joined later sends the offer (avoids offer collisions) */
          const iAmNewer=(joinedAt>p.joinedAt)||(joinedAt===p.joinedAt&&String(peerId)>String(p.id));
          if(iAmNewer)createPC(p.id,true);
        },
        onPeerLeave:({id})=>removePeer(id),
        onSignal:({from,payload})=>handleSignal(from,payload),
        onChat:m=>setMessages(prev=>[...prev,m]),
        onDraw:drawRemote,
        onDrawClear:clearBoard
      }
    });
    sigRef.current=sig;
    setInRoom(true);setConnecting(false);
    setMessages([{system:true,text:`Meeting ${code} is live. Share the link to invite others.`}]);
    if(created)setTimeout(()=>setShareOpen(true),700);
  }

  function toggleMic(){
    if(!localStream)return;
    const on=!micOn;localStream.getAudioTracks().forEach(t=>t.enabled=on);setMicOn(on);
  }
  function toggleCamera(){
    if(!localStream)return;
    const on=!camOn;localStream.getVideoTracks().forEach(t=>t.enabled=on);setCamOn(on);
  }

  async function toggleShare(){
    if(sharing){
      screenTrack.current?.stop();screenAudio.current?.stop();
      Object.values(pcs.current).forEach(pc=>pc.getSenders().filter(x=>x.track&&x.track.kind==='audio'&&x.track===screenAudio.current).forEach(x=>{try{pc.removeTrack(x)}catch(e){}}));
      screenTrack.current=null;screenAudio.current=null;setSharing(false);setScreenStream(null);
      const cam=baseStream.current?.getVideoTracks()[0]||null;
      Object.values(pcs.current).forEach(pc=>{pc.getSenders().filter(x=>x.track?.kind==='video').forEach(x=>x.replaceTrack(cam).catch(()=>{}));applyQuality(pc);});
      return;
    }
    try{
      const s=await navigator.mediaDevices.getDisplayMedia(SCREEN_CONSTRAINTS);
      const track=s.getVideoTracks()[0];
      screenTrack.current=track;setScreenStream(new MediaStream([track]));setSharing(true);
      /* send the share in Full HD detail to everyone */
      Object.values(pcs.current).forEach(pc=>{
        const sender=pc.getSenders().find(x=>x.track?.kind==='video');
        if(sender){sender.replaceTrack(track).catch(()=>{});}
        else{pc.addTrack(track,s);}
        try{track.contentHint='detail'}catch(e){}
        applyQuality(pc);
      });
      /* optional system/tab audio (Chrome) goes out too */
      const sysAudio=s.getAudioTracks()[0];
      if(sysAudio){screenAudio.current=sysAudio;Object.values(pcs.current).forEach(pc=>{if(!pc.getSenders().some(x=>x.track===sysAudio))pc.addTrack(sysAudio,s);});}
      track.onended=()=>toggleShare();
    }catch(e){console.warn('Screen share canceled',e);}
  }

  function sendChat(e){
    e?.preventDefault();
    if(!chatText.trim())return;
    const m={name:name||'You',text:chatText.trim(),time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),self:true};
    setMessages(prev=>[...prev,m]);sigRef.current?.sendChat(m);setChatText('');
  }

  function copyInvite(){
    navigator.clipboard?.writeText(inviteUrl).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),1800)}).catch(()=>{});
  }

  function toggleFullScreen(){
    if(!document.fullscreenElement)document.documentElement.requestFullscreen?.().catch(()=>{});
    else document.exitFullscreen?.();
  }

  function leave(){
    sigRef.current?.leave();sigRef.current=null;
    Object.values(pcs.current).forEach(p=>p.close());pcs.current={};streams.current={};pendingIce.current={};
    screenTrack.current?.stop();screenAudio.current?.stop();
    baseStream.current?.getTracks().forEach(t=>t.stop());
    baseStream.current=null;screenTrack.current=null;screenAudio.current=null;
    setLocalStream(null);setParticipants([]);setInRoom(false);setSharing(false);setScreenStream(null);
    setDrawing(false);setShareOpen(false);setMessages([]);
  }

  /* ---------- shared whiteboard (students can draw live) ---------- */
  function stroke(d){
    const c=canvasRef.current;if(!c)return;
    const ctx=c.getContext('2d');const rect=c.getBoundingClientRect();
    ctx.save();
    ctx.globalCompositeOperation=d.erase?'destination-out':'source-over';
    ctx.lineCap='round';ctx.lineJoin='round';
    ctx.strokeStyle=d.color||PEN_COLORS[0];ctx.lineWidth=d.width||4;
    ctx.beginPath();ctx.moveTo(d.x1*rect.width,d.y1*rect.height);ctx.lineTo(d.x2*rect.width,d.y2*rect.height);ctx.stroke();
    ctx.restore();
  }
  function clearBoard(){const c=canvasRef.current;c?.getContext('2d').clearRect(0,0,c.width,c.height);drawState.current=null;}
  function clearAll(){clearBoard();sigRef.current?.sendClear();}
  function drawRemote(d){stroke(d);}

  function pointerDown(e){
    if(!drawing)return;
    const r=e.currentTarget.getBoundingClientRect();
    drawState.current={x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};
    try{e.currentTarget.setPointerCapture(e.pointerId);}catch(err){}
  }
  function pointerMove(e){
    if(!drawing||!drawState.current)return;
    const r=e.currentTarget.getBoundingClientRect();
    const x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
    const d={x1:drawState.current.x,y1:drawState.current.y,x2:x,y2:y,color:penColor,width:penSize,erase:eraser};
    stroke(d);sigRef.current?.sendDraw(d);
    drawState.current={x,y};
  }
  function pointerUp(){drawState.current=null;}

  useEffect(()=>{
    const c=canvasRef.current;if(!c)return;
    const resize=()=>{const rect=c.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
      c.width=Math.max(1,rect.width*dpr);c.height=Math.max(1,rect.height*dpr);
      c.getContext('2d').setTransform(dpr,0,0,dpr,0,0);};
    resize();window.addEventListener('resize',resize);
    return()=>window.removeEventListener('resize',resize);
  },[inRoom]);

  useEffect(()=>{const q=new URLSearchParams(location.search).get('room');if(q)setRoom(q);},[]);

  /* ---------------- landing ---------------- */
  if(!inRoom)return (
    <main className="landing">
      <header className="nav">
        <div className="brand"><div className="logo"><Video size={21}/></div>Meetly</div>
        <span className="navlabel">Google-Meet style HD video meetings</span>
        <div className="secure"><Shield size={15}/> Private &amp; secure</div>
      </header>
      <section className="hero">
        <div className="left">
          <div className="eyebrow"><span className="pulse"/> YOUR SPACE TO CONNECT</div>
          <h1>Meet face to face.<br/><span>From anywhere.</span></h1>
          <p className="hero-desc">Full HD 1080p video, crystal-clear voice, screen sharing, live whiteboard for students and one invite link that just works.</p>
          <div className="benefits">
            <span><Video/> Full HD 1080p video</span>
            <span><MonitorUp/> Full HD screen share</span>
            <span><Mic/> Noise-free voice</span>
            <span><PenTool/> Live drawing board</span>
          </div>
          <div className="preview-card">
            <div className="preview-graphic">
              <div className="mini-person blue"><div className="head"/><div className="body"/></div>
              <div className="mini-person coral"><div className="head"/><div className="body"/></div>
              <div className="mini-person mint"><div className="head"/><div className="body"/></div>
              <div className="mini-person yellow"><div className="head"/><div className="body"/></div>
              <div className="graphic-dot d1"/><div className="graphic-dot d2"/>
            </div>
            <div className="preview-copy"><b>Good conversations start here.</b><small>Make room for every idea.</small></div>
          </div>
        </div>
        <div className="join-card">
          <div className="card-icon"><Users size={24}/></div>
          <h2>Start or join a meeting</h2>
          <p>Gather your team in seconds.</p>
          <label>Your name</label>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Enter your name" maxLength={40}/>
          <label>Meeting code</label>
          <div className="room-input"><Link2 size={17}/><input value={room} onChange={e=>setRoom(e.target.value.toUpperCase())} placeholder="Enter a code (or leave blank)" maxLength={32}/></div>
          <button className="primary" disabled={connecting} onClick={()=>joinMeeting(room,!room.trim())}>
            {connecting?'Connecting…':room?'Join meeting':'Create a meeting'}<ChevronRight/>
          </button>
          <div className="or"><span/>or<span/></div>
          <button className="secondary" onClick={()=>joinMeeting(codeGen(),true)}><Plus/>Create new meeting</button>
          <div className="small-note"><Shield size={13}/> No account required to try</div>
        </div>
      </section>
      <footer className="landing-footer"><span>© 2026 Meetly</span><span>HD Video · Screen share · Whiteboard · Chat</span></footer>
    </main>
  );

  /* ---------------- meeting ---------------- */
  return (
    <main className={`meeting ${fullScreen?'fullscreen':''}`}>
      <header className="meeting-top">
        <div className="brand"><div className="logo"><Video size={19}/></div>Meetly</div>
        <div className="room-meta">
          <b>{roomCode}</b>
          <span className="live"><i/> LIVE</span>
          <span className="hd-tag">HD 1080p</span>
          <button onClick={()=>setShareOpen(true)} className="invite"><Share2 size={15}/> Invite</button>
        </div>
        <div className="meeting-top-right">
          <span className="live-clock">● Connected</span>
          <button className="icon-btn" onClick={toggleFullScreen} title="Full screen">{fullScreen?<Minimize2/>:<Maximize2/>}</button>
        </div>
      </header>

      <div className="meeting-body">
        <section className="stage">
          <div className="tiles">
            {sharing&&screenStream?(
              <div className="tile screen-tile">
                <video ref={localVideo} autoPlay muted playsInline/>
                <div className="tile-name"><MonitorUp size={13}/> Your screen (You)</div>
              </div>
            ):localStream&&camOn?(
              <div className="tile local">
                <video ref={localVideo} autoPlay muted playsInline/>
                <div className="tile-name"><Mic size={13}/>{name} (You)</div>
              </div>
            ):(
              <div className="tile local avatar-tile">
                <div className="avatar">{(name||'Y').charAt(0).toUpperCase()}</div>
                <div className="tile-name">{name||'You'} (You)</div>
              </div>
            )}
            {participants.map(p=>(<div key={p.id} className="tile"><VideoBox stream={p.stream} name={p.name}/></div>))}
            {participants.length===0&&!sharing&&(
              <div className="empty-tile">
                <div className="empty-icon"><Users/></div>
                <h3>Waiting for others to join</h3>
                <p>Share the meeting link to invite people</p>
                <button onClick={()=>setShareOpen(true)}>{copied?<Check/>:<Copy/>}{copied?'Copied':'Copy invite link'}</button>
              </div>
            )}
          </div>

          {sharing&&camOn&&(
            <div className="self-pip"><video ref={selfVideo} autoPlay muted playsInline/><span><Camera size={11}/> You</span></div>
          )}

          {drawing&&(
            <div className="draw-toolbar">
              <span><PenTool size={14}/> Drawing</span>
              {PEN_COLORS.map(c=>(
                <button key={c} className={`swatch ${!eraser&&penColor===c?'sel':''}`}
                  style={{background:c}} title="Pen color"
                  onClick={()=>{setPenColor(c);setEraser(false);}}/>
              ))}
              <button className={`size-btn ${penSize===4?'sel':''}`} onClick={()=>setPenSize(4)} title="Thin stroke"><i className="dot sm"/></button>
              <button className={`size-btn ${penSize===9?'sel':''}`} onClick={()=>setPenSize(9)} title="Thick stroke"><i className="dot lg"/></button>
              <button className={`size-btn ${eraser?'sel':''}`} onClick={()=>setEraser(!eraser)} title="Eraser"><Eraser size={14}/></button>
              <button className="clear-btn" onClick={clearAll}><Trash2 size={14}/> Clear</button>
            </div>
          )}

          <canvas ref={canvasRef} className={`drawing-layer ${drawing?'draw-active':''}`}
            onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}/>

          <div className="meeting-controls">
            <button className={`control ${!micOn?'off':''}`} onClick={toggleMic} title="Toggle microphone">
              {micOn?<Mic/>:<MicOff/>}<span>{micOn?'Mute':'Unmute'}</span>
            </button>
            <button className={`control ${!camOn?'off':''}`} onClick={toggleCamera} title="Toggle camera">
              {camOn?<Camera/>:<VideoOff/>}<span>{camOn?'Stop video':'Start video'}</span>
            </button>
            <button className={`control ${sharing?'active':''}`} onClick={toggleShare} title="Share full-HD screen">
              {sharing?<MonitorOff/>:<MonitorUp/>}<span>{sharing?'Stop share':'Share screen'}</span>
            </button>
            <button className={`control ${drawing?'active':''}`} onClick={()=>setDrawing(!drawing)} title="Whiteboard">
              <PenTool/><span>{drawing?'Close drawing':'Draw'}</span>
            </button>
            <button className="control" onClick={()=>setActiveTab('people')}><Users/><span>People</span><small>{participants.length+1}</small></button>
            <button className={`control ${activeTab==='chat'?'active':''}`} onClick={()=>setActiveTab('chat')}><MessageCircle/><span>Chat</span></button>
            <button className="control" onClick={()=>setShareOpen(true)}><Share2/><span>Invite</span></button>
            <button className="hangup" onClick={leave}><PhoneOff/><span>Leave</span></button>
          </div>
        </section>

        <aside className="side-panel">
          <div className="panel-tabs">
            <button className={activeTab==='chat'?'selected':''} onClick={()=>setActiveTab('chat')}><MessageCircle/>Chat</button>
            <button className={activeTab==='people'?'selected':''} onClick={()=>setActiveTab('people')}><Users/>People <span>{participants.length+1}</span></button>
          </div>

          {activeTab==='chat'?(
            <div className="chat-panel">
              <div className="chat-head"><b>Meeting chat</b><small>Messages are shared with everyone</small></div>
              <div className="chat-messages">
                {messages.map((m,i)=>(
                  <div key={i} className={`msg ${m.self?'self':''} ${m.system?'system':''}`}>
                    {m.system?<div className="system-msg">{m.text}</div>:<>
                      <div className="msg-head"><b>{m.self?'You':m.name}</b><small>{m.time}</small></div>
                      <div className="msg-text">{m.text}</div>
                    </>}
                  </div>
                ))}
                <div ref={chatEnd}/>
              </div>
              <form className="chat-compose" onSubmit={sendChat}>
                <input value={chatText} onChange={e=>setChatText(e.target.value)} placeholder="Send a message…"/>
                <button disabled={!chatText.trim()}><Send/></button>
              </form>
            </div>
          ):(
            <div className="people-panel">
              <h3>In this meeting</h3>
              <div className="person-row">
                <div className="avatar-sm">{name?.[0]?.toUpperCase()||'Y'}</div>
                <div><b>{name||'You'}</b><small>Meeting host · You</small></div>
                <span className="audio-pill">{micOn?<Mic size={14}/>:<MicOff size={14}/>}</span>
              </div>
              {participants.map(p=>(
                <div className="person-row" key={p.id}>
                  <div className="avatar-sm guest">{p.name[0].toUpperCase()}</div>
                  <div><b>{p.name}</b><small>Participant</small></div>
                  <span className="audio-pill"><Mic size={14}/></span>
                </div>
              ))}
            </div>
          )}

          <div className="panel-bottom">
            <div className="encrypted"><Shield/><span><b>Meeting is private</b><small>Only people with the link can join</small></span></div>
            <button className="copy-link" onClick={copyInvite}>{copied?<Check/>:<Copy/>}{copied?'Copied!':'Copy meeting link'}</button>
          </div>
        </aside>
      </div>

      {shareOpen&&(
        <div className="modal-backdrop" onClick={()=>setShareOpen(false)}>
          <div className="share-modal" onClick={e=>e.stopPropagation()}>
            <button className="modal-x" onClick={()=>setShareOpen(false)}><X/></button>
            <div className="share-icon"><Share2 size={22}/></div>
            <h3>Invite people to {roomCode}</h3>
            <p>Send this link — anyone who opens it can join the meeting straight from their browser.</p>
            <div className="link-row"><Link2 size={16}/><input readOnly value={inviteUrl} onFocus={e=>e.target.select()}/></div>
            <div className="modal-actions">
              <button onClick={copyInvite}>{copied?<Check/>:<Copy/>}{copied?'Copied!':'Copy link'}</button>
              <a target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent('Join my meeting: '+inviteUrl)}`}>WhatsApp</a>
              <a target="_blank" rel="noreferrer" href={`https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent('Join my meeting')}`}>Telegram</a>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function VideoBox({stream,name}){
  const ref=useRef(null);
  useEffect(()=>{if(ref.current&&stream)ref.current.srcObject=stream;},[stream]);
  return stream?<><video ref={ref} autoPlay playsInline/><div className="tile-name"><Mic size={13}/>{name}</div></>
    :<div className="avatar-tile"><div className="avatar">{name?.[0]?.toUpperCase()}</div><div className="tile-name">{name}</div></div>;
}

createRoot(document.getElementById('root')).render(<App/>);
