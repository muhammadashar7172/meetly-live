import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
const app=express(); const httpServer=createServer(app);
const io=new Server(httpServer,{cors:{origin:'*'}});
io.on('connection',socket=>{
  socket.on('join-room',({room,name})=>{
    room=String(room||'').trim().toUpperCase().slice(0,32); name=String(name||'Guest').trim().slice(0,40);
    if(!room)return;
    socket.data.room=room; socket.data.name=name; socket.join(room);
    const peers=[...io.sockets.adapter.rooms.get(room)||[]].filter(id=>id!==socket.id).map(id=>({id,name:io.sockets.sockets.get(id)?.data?.name||'Guest'}));
    socket.emit('room-peers',peers);
    socket.to(room).emit('peer-joined',{id:socket.id,name});
  });
  socket.on('signal',({to,payload})=>{ if(to) io.to(to).emit('signal',{from:socket.id,payload}); });
  socket.on('chat-message',message=>{if(socket.data.room)socket.to(socket.data.room).emit('chat-message',message);});
  socket.on('draw',data=>{if(socket.data.room)socket.to(socket.data.room).emit('draw',data);});
  socket.on('draw-clear',()=>{if(socket.data.room)socket.to(socket.data.room).emit('draw-clear');});
  socket.on('leave-room',()=>{const room=socket.data.room;if(room){socket.to(room).emit('peer-left',{id:socket.id});socket.leave(room);socket.data.room=null;}});
  socket.on('disconnect',()=>{const room=socket.data.room;if(room)socket.to(room).emit('peer-left',{id:socket.id});});
});
httpServer.listen(3001,()=>console.log('Meetly signaling server: http://localhost:3001'));
