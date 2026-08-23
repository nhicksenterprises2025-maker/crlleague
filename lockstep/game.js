(() => {
'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = 1280, H = 720, STEP = 1 / 60;
const CORE = { x: W / 2, y: H / 2, r: 82 };
const OBSTACLES = [
  {x:370,y:115,w:48,h:190},{x:370,y:415,w:48,h:190},
  {x:862,y:115,w:48,h:190},{x:862,y:415,w:48,h:190},
  {x:545,y:80,w:190,h:34},{x:545,y:606,w:190,h:34}
];
const COLORS = { p:'#42dcff', e:'#ff8a46', core:'#e9e57b', bg:'#091018' };
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const len=(x,y)=>Math.hypot(x,y);
const norm=(x,y)=>{const l=len(x,y);return l>0?{x:x/l,y:y/l}:{x:0,y:0}};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

let clock=0, accumulator=0, last=performance.now(), gameOver=false, winner='';
let coreCharge=0; // -100 enemy, +100 player
let selectedDrone=0;
let projectiles=[];

const player={id:'pC',team:'p',x:165,y:360,r:20,hp:200,maxHp:200,energy:100,aimX:1,aimY:0,shotCd:0,dashCd:0,guardT:0,speed:225};
const enemy={id:'eC',team:'e',x:1115,y:360,r:20,hp:200,maxHp:200,energy:100,aimX:-1,aimY:0,shotCd:0,dashCd:0,guardT:0,speed:205};

const droneDefs=[
  {name:'ASSAULT',hp:80,speed:115,damage:12,fireCd:.55,range:320,r:15},
  {name:'SHIELD',hp:110,speed:90,damage:7,fireCd:.85,range:240,r:18},
  {name:'INTERCEPT',hp:65,speed:155,damage:9,fireCd:.38,range:230,r:13}
];
function makeDrone(team,i,x,y){const d=droneDefs[i];return{id:`${team}D${i}`,team,type:i,x,y,targetX:x,targetY:y,hp:d.hp,maxHp:d.hp,shotCd:.3*i,r:d.r,alive:true};}
const pDrones=[makeDrone('p',0,235,270),makeDrone('p',1,235,360),makeDrone('p',2,235,450)];
const eDrones=[makeDrone('e',0,1045,270),makeDrone('e',1,1045,360),makeDrone('e',2,1045,450)];

const input={move:{x:0,y:0,pointer:null,startX:0,startY:0},aim:{x:0,y:0,pointer:null,startX:0,startY:0}};

function pointInRect(x,y,o,pad=0){return x>o.x-pad&&x<o.x+o.w+pad&&y>o.y-pad&&y<o.y+o.h+pad;}
function circleHitsObstacle(x,y,r){return OBSTACLES.some(o=>pointInRect(x,y,o,r));}
function moveCircle(ent,vx,vy,dt){
  let nx=clamp(ent.x+vx*dt,ent.r+8,W-ent.r-8);
  if(!circleHitsObstacle(nx,ent.y,ent.r)) ent.x=nx;
  let ny=clamp(ent.y+vy*dt,ent.r+8,H-ent.r-8);
  if(!circleHitsObstacle(ent.x,ny,ent.r)) ent.y=ny;
}
function applyDamage(target,amount){
  if(gameOver||!target) return;
  if(target.id.endsWith('C')){
    if(target.guardT>0) amount*=.4;
    const shield=target.team==='p'?pDrones[1]:eDrones[1];
    if(shield?.alive&&dist(target,shield)<115) amount*=.8;
  }
  target.hp=Math.max(0,target.hp-amount);
  if(!target.id.endsWith('C')&&target.hp<=0) target.alive=false;
  if(player.hp<=0) finish('DEFEAT','Enemy commander eliminated you.');
  if(enemy.hp<=0) finish('VICTORY','Enemy commander eliminated.');
}
function fire(shooter,dx,dy,damage=16,speed=760,r=4){
  const n=norm(dx,dy); if(n.x===0&&n.y===0)return;
  projectiles.push({team:shooter.team,x:shooter.x+n.x*(shooter.r+8),y:shooter.y+n.y*(shooter.r+8),vx:n.x*speed,vy:n.y*speed,damage,r,life:1.6});
}
function dash(ent,dx,dy){
  const n=norm(dx,dy); if(!n.x&&!n.y)return;
  for(let i=0;i<10;i++) moveCircle(ent,n.x*840,n.y*840,1/60);
}

function updateCommander(ent,isPlayer){
  ent.energy=clamp(ent.energy+18*STEP,0,100);
  ent.shotCd=Math.max(0,ent.shotCd-STEP); ent.dashCd=Math.max(0,ent.dashCd-STEP); ent.guardT=Math.max(0,ent.guardT-STEP);
  if(isPlayer){
    moveCircle(ent,input.move.x*ent.speed,input.move.y*ent.speed,STEP);
    if(len(input.aim.x,input.aim.y)>.18){ent.aimX=input.aim.x;ent.aimY=input.aim.y;}
    if(len(input.aim.x,input.aim.y)>.42&&ent.shotCd<=0&&ent.energy>=8){fire(ent,ent.aimX,ent.aimY);ent.energy-=8;ent.shotCd=.22;}
  }else updateEnemyAI(ent);
}

function updateEnemyAI(ent){
  const toP={x:player.x-ent.x,y:player.y-ent.y}; const dp=len(toP.x,toP.y); const np=norm(toP.x,toP.y);
  ent.aimX=np.x; ent.aimY=np.y;
  let mv={x:0,y:0};
  const dc=Math.hypot(ent.x-CORE.x,ent.y-CORE.y);
  if(dp<185){mv={x:-np.x,y:-np.y};}
  else if(dc>68){mv=norm(CORE.x-ent.x,CORE.y-ent.y);}
  else {const s=Math.sin(clock*.9); mv=norm(-(ent.y-CORE.y),ent.x-CORE.x); mv.x*=s>=0?1:-1;mv.y*=s>=0?1:-1;}
  moveCircle(ent,mv.x*ent.speed,mv.y*ent.speed,STEP);
  if(dp<155&&ent.dashCd<=0&&ent.energy>=24){dash(ent,-np.x,-np.y);ent.energy-=24;ent.dashCd=2.2;}
  const incoming=projectiles.some(p=>p.team==='p'&&Math.hypot(p.x-ent.x,p.y-ent.y)<145);
  if(incoming&&ent.guardT<=0&&ent.energy>=30){ent.energy-=30;ent.guardT=1.2;}
  if(dp<520&&ent.shotCd<=0&&ent.energy>=8){fire(ent,ent.aimX,ent.aimY);ent.energy-=8;ent.shotCd=.22;}
}

function entities(team){return team==='p'?[player,...pDrones.filter(d=>d.alive)]:[enemy,...eDrones.filter(d=>d.alive)];}
function nearestTarget(drone){
  const list=entities(drone.team==='p'?'e':'p').filter(t=>t.hp>0);
  list.sort((a,b)=>{const da=dist(drone,a),db=dist(drone,b); return da!==db?da-db:a.id.localeCompare(b.id);});
  return list[0]||null;
}
function updateDrone(d,idx){
  if(!d.alive)return; const def=droneDefs[d.type]; d.shotCd=Math.max(0,d.shotCd-STEP);
  if(d.team==='e'){
    const offsets=[{x:-88,y:-88},{x:-110,y:0},{x:-88,y:88}]; d.targetX=enemy.x+offsets[idx].x;d.targetY=enemy.y+offsets[idx].y;
  }
  const dx=d.targetX-d.x,dy=d.targetY-d.y,dl=len(dx,dy); if(dl>7){const n=norm(dx,dy);moveCircle(d,n.x*def.speed,n.y*def.speed,STEP);}
  const t=nearestTarget(d); if(t&&dist(d,t)<=def.range&&d.shotCd<=0){fire(d,t.x-d.x,t.y-d.y,def.damage,620,3);d.shotCd=def.fireCd;}
}

function updateProjectiles(){
  for(const p of projectiles){p.x+=p.vx*STEP;p.y+=p.vy*STEP;p.life-=STEP;
    if(p.x<0||p.x>W||p.y<0||p.y>H||OBSTACLES.some(o=>pointInRect(p.x,p.y,o,p.r))){p.life=0;continue;}
    const targets=entities(p.team==='p'?'e':'p');
    for(const t of targets){if(t.hp<=0||(!t.id.endsWith('C')&&!t.alive))continue;if(Math.hypot(p.x-t.x,p.y-t.y)<=p.r+t.r){applyDamage(t,p.damage);p.life=0;break;}}
  }
  projectiles=projectiles.filter(p=>p.life>0);
}

function updateCore(){
  const pIn=dist(player,CORE)<=CORE.r, eIn=dist(enemy,CORE)<=CORE.r;
  if(pIn&&!eIn) coreCharge=clamp(coreCharge+12*STEP,-100,100);
  else if(eIn&&!pIn) coreCharge=clamp(coreCharge-12*STEP,-100,100);
  else if(!pIn&&!eIn){if(coreCharge>0)coreCharge=Math.max(0,coreCharge-3*STEP);else coreCharge=Math.min(0,coreCharge+3*STEP);}
  if(coreCharge>=100)finish('VICTORY','You overloaded the central Core.');
  if(coreCharge<=-100)finish('DEFEAT','Enemy overloaded the central Core.');
}
function finish(title,reason){if(gameOver)return;gameOver=true;winner=title;document.getElementById('message').textContent=`${title} — ${reason}`;document.getElementById('restart').hidden=false;}

function step(){if(gameOver)return;clock+=STEP;updateCommander(player,true);updateCommander(enemy,false);pDrones.forEach(updateDrone);eDrones.forEach(updateDrone);updateProjectiles();updateCore();updateHUD();}

function updateHUD(){
  document.getElementById('playerHp').textContent=Math.ceil(player.hp);document.getElementById('enemyHp').textContent=Math.ceil(enemy.hp);
  document.getElementById('energyText').textContent=Math.floor(player.energy);document.getElementById('energyBar').style.width=`${player.energy}%`;
  document.getElementById('coreText').textContent=`${Math.round(Math.abs(coreCharge))}% ${coreCharge>0?'YOU':coreCharge<0?'CPU':''}`;
  pDrones.forEach((d,i)=>document.getElementById(`d${i}`).textContent=d.alive?Math.ceil(d.hp):'X');
}

function drawGrid(){ctx.fillStyle=COLORS.bg;ctx.fillRect(0,0,W,H);ctx.strokeStyle='rgba(130,155,176,.07)';ctx.lineWidth=1;for(let x=0;x<W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}for(let y=0;y<H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}}
function drawCore(){ctx.save();ctx.translate(CORE.x,CORE.y);ctx.strokeStyle=COLORS.core;ctx.lineWidth=3;ctx.setLineDash([8,8]);ctx.beginPath();ctx.arc(0,0,CORE.r,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=.13;ctx.fillStyle=coreCharge>=0?COLORS.p:COLORS.e;ctx.beginPath();ctx.arc(0,0,CORE.r-9,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.fillStyle=COLORS.core;ctx.font='900 15px -apple-system';ctx.textAlign='center';ctx.fillText('CORE',0,5);ctx.restore()}
function drawObstacles(){for(const o of OBSTACLES){ctx.fillStyle='#24313d';ctx.fillRect(o.x,o.y,o.w,o.h);ctx.strokeStyle='#425465';ctx.strokeRect(o.x+.5,o.y+.5,o.w-1,o.h-1)}}
function drawUnit(u,label,color){if(u.hp<=0)return;ctx.save();ctx.translate(u.x,u.y);ctx.fillStyle=color+'22';ctx.beginPath();ctx.arc(0,0,u.r+8,0,Math.PI*2);ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,u.r,0,Math.PI*2);ctx.stroke();ctx.fillStyle=color;ctx.font='900 12px -apple-system';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,0,0);ctx.fillStyle='#03070a';ctx.fillRect(-24,u.r+7,48,5);ctx.fillStyle=u.hp/u.maxHp>.45?'#78e6ad':'#ff646d';ctx.fillRect(-24,u.r+7,48*(u.hp/u.maxHp),5);if(u.guardT>0){ctx.strokeStyle=COLORS.core;ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,u.r+13,-1.2,1.2);ctx.stroke()}ctx.restore()}
function drawDrone(d){if(!d.alive)return;const color=d.team==='p'?COLORS.p:COLORS.e;const glyph=['A','S','I'][d.type];ctx.save();ctx.translate(d.x,d.y);ctx.rotate(Math.PI/4);ctx.strokeStyle=color;ctx.lineWidth=d.type===1?3:2;ctx.strokeRect(-d.r*.8,-d.r*.8,d.r*1.6,d.r*1.6);ctx.rotate(-Math.PI/4);ctx.fillStyle=color;ctx.font='900 10px -apple-system';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(glyph,0,0);if(d.team==='p'&&pDrones[selectedDrone]===d){ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,d.r+9,0,Math.PI*2);ctx.stroke()}ctx.restore()}
function drawProjectiles(){for(const p of projectiles){ctx.fillStyle=p.team==='p'?COLORS.p:COLORS.e;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()}}
function draw(){drawGrid();drawCore();drawObstacles();drawUnit(player,'YOU',COLORS.p);drawUnit(enemy,'CPU',COLORS.e);pDrones.forEach(drawDrone);eDrones.forEach(drawDrone);drawProjectiles()}

function frame(now){let dt=Math.min(.05,(now-last)/1000);last=now;accumulator+=dt;while(accumulator>=STEP){step();accumulator-=STEP}draw();requestAnimationFrame(frame)}

function canvasPoint(evt){const r=canvas.getBoundingClientRect();return{x:(evt.clientX-r.left)/r.width*W,y:(evt.clientY-r.top)/r.height*H,cx:evt.clientX-r.left,cy:evt.clientY-r.top,rw:r.width,rh:r.height};}
function setStick(kind,evt){const s=input[kind],dx=evt.clientX-s.startX,dy=evt.clientY-s.startY,max=48,normMag=Math.min(1,Math.hypot(dx,dy)/max);const n=norm(dx,dy);s.x=n.x*normMag;s.y=n.y*normMag;const knob=document.querySelector(`#${kind==='move'?'left':'right'}Stick i`);knob.style.transform=`translate(${n.x*normMag*30}px,${n.y*normMag*30}px)`;}
canvas.addEventListener('pointerdown',evt=>{if(gameOver)return;const p=canvasPoint(evt);canvas.setPointerCapture(evt.pointerId);if(p.cy>p.rh*.46&&p.cx<p.rw*.38&&input.move.pointer===null){input.move.pointer=evt.pointerId;input.move.startX=evt.clientX;input.move.startY=evt.clientY;setStick('move',evt);return}if(p.cy>p.rh*.46&&p.cx>p.rw*.62&&input.aim.pointer===null){input.aim.pointer=evt.pointerId;input.aim.startX=evt.clientX;input.aim.startY=evt.clientY;setStick('aim',evt);return}const d=pDrones[selectedDrone];if(d&&d.alive){d.targetX=clamp(p.x,d.r,W-d.r);d.targetY=clamp(p.y,d.r,H-d.r);document.getElementById('message').textContent=`${droneDefs[d.type].name} moving to command point.`;}});
canvas.addEventListener('pointermove',evt=>{if(evt.pointerId===input.move.pointer)setStick('move',evt);if(evt.pointerId===input.aim.pointer)setStick('aim',evt)});
function releasePointer(evt){for(const k of ['move','aim']){const s=input[k];if(evt.pointerId===s.pointer){s.pointer=null;s.x=0;s.y=0;document.querySelector(`#${k==='move'?'left':'right'}Stick i`).style.transform='translate(0,0)';}}}
canvas.addEventListener('pointerup',releasePointer);canvas.addEventListener('pointercancel',releasePointer);

document.querySelectorAll('.drone').forEach(btn=>btn.addEventListener('pointerdown',evt=>{evt.stopPropagation();selectedDrone=Number(btn.dataset.drone);document.querySelectorAll('.drone').forEach(b=>b.classList.toggle('active',b===btn));const d=pDrones[selectedDrone];document.getElementById('message').textContent=d.alive?`Selected ${droneDefs[d.type].name}. Tap the battlefield to reposition it.`:`${droneDefs[d.type].name} is destroyed.`;}));
document.getElementById('dashBtn').addEventListener('pointerdown',()=>{if(gameOver||player.dashCd>0||player.energy<24)return;let v=len(input.move.x,input.move.y)>.15?input.move:{x:player.aimX,y:player.aimY};dash(player,v.x,v.y);player.energy-=24;player.dashCd=2.2;document.getElementById('message').textContent='Dash committed · 24 Energy.';});
document.getElementById('guardBtn').addEventListener('pointerdown',()=>{if(gameOver||player.guardT>0||player.energy<30)return;player.energy-=30;player.guardT=1.2;document.getElementById('message').textContent='Guard active · 60% damage reduction for 1.2s.';});
document.getElementById('restart').addEventListener('click',()=>location.reload());

updateHUD();requestAnimationFrame(frame);
})();