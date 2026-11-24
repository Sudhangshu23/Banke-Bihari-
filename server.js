// Banke Bihari Cafe - unified backend (Express + Socket.IO). DEV store is in-memory; see prisma/schema.prisma for MySQL.
const express=require('express'),http=require('http'),crypto=require('crypto');
const jwt=require('jsonwebtoken'),bcrypt=require('bcryptjs'),rate=require('express-rate-limit');
const {Server}=require('socket.io'),os=require('os');
// Address that QR codes open. Phones can't use 'localhost': use LAN IP, or set PUBLIC_URL to your online address.
function pubUrl(){if(process.env.PUBLIC_URL)return process.env.PUBLIC_URL.replace(/\/+$/,'');let ip='localhost';for(const l of Object.values(os.networkInterfaces()))for(const i of l||[])if(i.family==='IPv4'&&!i.internal&&ip==='localhost')ip=i.address;return `http://${ip}:${process.env.PORT||3000}`}
const app=express(),srv=http.createServer(app),io=new Server(srv,{cors:{origin:'*'}});
const SECRET=process.env.JWT_SECRET||crypto.randomBytes(32).toString('hex');
// DEV CORS (lets app.html work when opened as a file). Restrict origins in production.
app.use((q,r,n)=>{r.set({'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS'});q.method==='OPTIONS'?r.sendStatus(204):n()});
app.use(express.json({limit:'100kb'}));app.get('/staff',(q,r)=>r.redirect('/app.html#staff'));
app.get('/',(q,r,n)=>q.query.t?r.sendFile(__dirname+'/public/app.html'):n());
app.use(express.static(__dirname+'/public'));
app.use('/api/login',rate({windowMs:60000,max:10}));app.use('/api',rate({windowMs:60000,max:300}));

// ---- dev store ----
const pw=bcrypt.hashSync(process.env.DEV_PASSWORD||'aldo123',10);
const users=['admin','kitchen','waiter','pos'].map(r=>({username:r,role:r,hash:pw,active:true}));
const settings={name:'Banke Bihari Cafe',gstin:'',upiId:'',publicUrl:pubUrl(),gstPercent:5,inclusive:false},ingredients=[];let iid=1;
const QR=require('qrcode');
const tables=Array.from({length:10},(_,i)=>({number:i+1,token:crypto.randomBytes(16).toString('hex'),status:'available',seats:4}));
const menu=[]; // NOT pre-filled: admin adds real items/prices (no invented data)
const orders=[],calls=[],audit=[],bookings=[];let seq=1,mid=1,bseq=1,cseq=1,invSeq=0;
const log=(u,a,d)=>audit.push({t:new Date().toISOString(),user:u,action:a,detail:d});
const tbl=t=>tables.find(x=>x.token===t);

// ---- auth ----
const auth=(...roles)=>(q,r,n)=>{try{const u=jwt.verify((q.headers.authorization||'').replace('Bearer ',''),SECRET);
 if(roles.length&&!roles.includes(u.role))return r.status(403).json({error:'forbidden'});q.user=u;n();}catch{r.status(401).json({error:'unauthorised'})}};
app.post('/api/login',(q,r)=>{const u=users.find(x=>x.username===q.body.username);
 if(!u||u.active===false||!bcrypt.compareSync(String(q.body.password||''),u.hash))return r.status(401).json({error:'invalid credentials'});
 r.json({token:jwt.sign({username:u.username,role:u.role},SECRET,{expiresIn:'12h'}),role:u.role});});

// ---- customer (token-validated; table number is never trusted) ----
app.get('/api/menu',(q,r)=>r.json(menu.filter(m=>m.available)));
app.get('/api/table/:token',(q,r)=>{const t=tbl(q.params.token);t?r.json({number:t.number}):r.status(404).json({error:'invalid QR'})});
app.post('/api/orders',(q,r)=>{const t=tbl(q.body.token);if(!t)return r.status(403).json({error:'invalid QR token'});
 const items=[];for(const i of q.body.items||[]){const m=menu.find(x=>x.id===i.menuId&&x.available),n=parseInt(i.qty);
  if(!m||!(n>0&&n<=50))return r.status(400).json({error:'bad item'});items.push({menuId:m.id,name:m.name,price:m.price,qty:n,note:String(i.note||'').slice(0,200)});}
 if(!items.length)return r.status(400).json({error:'empty order'});
 const o={id:seq++,table:t.number,items,total:items.reduce((s,i)=>s+i.price*i.qty,0),status:'new',paid:false,createdAt:Date.now(),history:[{s:'new',t:Date.now()}]};
 orders.push(o);if(t.status==='available')t.status='occupied';
 io.to('staff').emit('order:new',o);r.json({id:o.id,status:o.status});});
app.get('/api/orders/:id',(q,r)=>{const o=orders.find(x=>x.id==q.params.id),t=tbl(q.query.token);
 o&&t&&t.number===o.table?r.json({...o,bill:bill(o)}):r.status(404).json({error:'not found'})});
app.post('/api/call',(q,r)=>{const t=tbl(q.body.token);if(!t)return r.status(403).json({error:'invalid QR'});
 const c={id:cseq++,table:t.number,t:Date.now(),done:false,message:String(q.body.message||'').slice(0,200)};calls.push(c);io.to('staff').emit('call',c);r.json({ok:true})});

app.post('/api/bookings',(q,r)=>{const b=q.body,d=new Date(b.date);
 if(!b.name||!b.phone||isNaN(d)||!(+b.guests>0&&+b.guests<=30))return r.status(400).json({error:'name, phone, valid date and guests required'});
 const x={id:bseq++,name:String(b.name).slice(0,80),phone:String(b.phone).slice(0,30),date:String(b.date),slot:String(b.slot||'').slice(0,40),guests:+b.guests,seating:String(b.seating||'').slice(0,30),status:'pending'};
 bookings.push(x);io.to('staff').emit('booking:new',x);r.json({ok:true,id:x.id})});
app.get('/api/bookings',auth('admin','waiter','pos'),(q,r)=>r.json(bookings));
// ---- staff ----
const flow={kitchen:{new:'accepted',accepted:'preparing',preparing:'ready'},waiter:{ready:'served'},admin:{new:'accepted',accepted:'preparing',preparing:'ready',ready:'served'}};
app.get('/api/orders',auth('admin','kitchen','waiter','pos'),(q,r)=>r.json(orders));
app.get('/api/calls',auth('admin','waiter'),(q,r)=>r.json(calls.filter(c=>!c.done)));
app.patch('/api/orders/:id/status',auth('admin','kitchen','waiter'),(q,r)=>{
 const o=orders.find(x=>x.id==q.params.id);if(!o)return r.sendStatus(404);
 const next=(flow[q.user.role]||{})[o.status];if(!next||next!==q.body.status)return r.status(409).json({error:`cannot move ${o.status} -> ${q.body.status} as ${q.user.role}`});
 o.status=next;o.history.push({s:next,t:Date.now(),by:q.user.username});
 const t=tables.find(x=>x.number===o.table);if(next==='preparing')t.status='preparing';
 io.emit('order:update',o);if(next==='ready')io.to('waiter').emit('order:ready',o);
 log(q.user.username,'status',`#${o.id} ${next}`);r.json(o);});
// ---- admin ----
app.get('/api/admin/tables',auth('admin'),(q,r)=>r.json(tables));
app.get('/api/admin/menu',auth('admin'),(q,r)=>r.json(menu));
app.post('/api/admin/menu',auth('admin'),(q,r)=>{const {name,category,price,veg,available,description,prepMinutes}=q.body;
 if(!name||!(Number(price)>=0))return r.status(400).json({error:'name and price required'});
 const m={id:mid++,name:String(name),category:String(category||''),price:Number(price),veg:!!veg,available:available!==false,description:String(description||'').slice(0,300),prepMinutes:Number(prepMinutes)||null};menu.push(m);log(q.user.username,'menu+',name);r.json(m);});
app.patch('/api/admin/menu/:id',auth('admin'),(q,r)=>{const m=menu.find(x=>x.id==q.params.id);if(!m)return r.sendStatus(404);
 for(const k of['name','category','price','veg','available','description','prepMinutes'])if(k in q.body)m[k]=q.body[k];r.json(m);});
app.patch('/api/admin/tables/:n',auth('admin','waiter','pos'),(q,r)=>{const t=tables.find(x=>x.number==q.params.n);if(!t)return r.sendStatus(404);
 t.status=String(q.body.status);io.emit('table:update',{number:t.number,status:t.status});r.json({number:t.number,status:t.status});});
app.get('/api/admin/report',auth('admin'),(q,r)=>{const p=orders.filter(o=>o.paid),by={};
 p.forEach(o=>o.items.forEach(i=>by[i.name]=(by[i.name]||0)+i.qty));
 r.json({orders:orders.length,paidOrders:p.length,sales:p.reduce((s,o)=>s+o.total,0),bestSellers:by});});
app.get('/api/admin/audit',auth('admin'),(q,r)=>r.json(audit));


// ---- billing / GST ----
const rd=n=>Math.round(n*100)/100;
function bill(o){const sub=rd(o.items.reduce((a,i)=>a+i.price*i.qty,0)),d=Math.min(rd(o.discount||0),sub),tx=sub-d,p=settings.gstPercent/100;
 const gst=rd(settings.inclusive?tx-tx/(1+p):tx*p),total=rd(settings.inclusive?tx:tx+gst);return{subtotal:sub,discount:d,cgst:rd(gst/2),sgst:rd(gst/2),gst,total,inclusive:settings.inclusive,gstPercent:settings.gstPercent}}
const MPAY=['cash','card-terminal','upi-counter'];
app.post('/api/orders/:id/pay',auth('admin','pos'),(q,r)=>{const o=orders.find(x=>x.id==q.params.id);if(!o)return r.sendStatus(404);
 if(!MPAY.includes(q.body.method))return r.status(501).json({error:'Online/UPI gateway needs a provider + verified webhook (not configured). Use cash, card terminal or UPI at counter.'});
 if(o.status!=='served')return r.status(409).json({error:'order not served yet'});if(o.paid)return r.status(409).json({error:'already paid'});
 const b=bill(o);o.paid=true;o.invoiceNo='INV-'+String(++invSeq).padStart(5,'0');o.payment={method:q.body.method,amount:b.total,at:Date.now(),verified:q.body.method==='cash',recordedBy:q.user.username};
 if(!orders.some(x=>x.table===o.table&&!x.paid&&x.status!=='cancelled')){const t=tables.find(x=>x.number===o.table);if(t)t.status='needs-cleaning'}
 io.emit('order:update',o);log(q.user.username,'pay',`#${o.id} ${q.body.method} ${b.total}`);r.json(o)});
app.get('/api/orders/:id/bill',auth('admin','pos','waiter'),(q,r)=>{const o=orders.find(x=>x.id==q.params.id);if(!o)return r.sendStatus(404);r.json({shop:settings,order:o,bill:bill(o)})});
app.post('/api/orders/:id/cancel',auth('admin','pos'),(q,r)=>{const o=orders.find(x=>x.id==q.params.id);if(!o||o.paid)return r.status(409).json({error:'cannot cancel'});o.status='cancelled';io.emit('order:update',o);log(q.user.username,'cancel','#'+o.id);r.json(o)});
app.post('/api/pos/orders',auth('admin','pos'),(q,r)=>{const b=q.body,items=[];let t=null;
 if(b.type!=='takeaway'){t=tables.find(x=>x.number==b.table);if(!t)return r.status(400).json({error:'select a table or takeaway'})}
 for(const i of b.items||[]){const m=menu.find(x=>x.id===i.menuId&&x.available),n=parseInt(i.qty);if(!m||!(n>0&&n<=50))return r.status(400).json({error:'bad item'});items.push({menuId:m.id,name:m.name,price:m.price,qty:n,note:''})}
 if(!items.length)return r.status(400).json({error:'add items first'});let disc=0;
 if(Number(b.discount)>0){const ad=users.find(u=>u.role==='admin');if(q.user.role!=='admin'&&!bcrypt.compareSync(String(b.authPassword||''),ad.hash))return r.status(403).json({error:'discount needs admin password'});disc=Number(b.discount)}
 const o={id:seq++,table:t?t.number:0,type:t?'dine-in':'takeaway',items,discount:disc,total:items.reduce((s,i)=>s+i.price*i.qty,0),status:'new',paid:false,createdAt:Date.now(),history:[{s:'new',t:Date.now(),by:q.user.username}]};
 orders.push(o);if(t&&t.status==='available')t.status='occupied';io.to('staff').emit('order:new',o);log(q.user.username,'pos-order','#'+o.id+(disc?' disc '+disc:''));r.json(o)});
app.get('/api/tables',auth('admin','waiter','pos','kitchen'),(q,r)=>r.json(tables.map(t=>({number:t.number,seats:t.seats,status:t.status}))));
app.get('/api/settings',auth(),(q,r)=>r.json(settings));
app.put('/api/admin/settings',auth('admin'),(q,r)=>{const b=q.body;settings.name=String(b.name||settings.name).slice(0,80);settings.gstin=String(b.gstin||'').slice(0,20);settings.upiId=String(b.upiId||'').slice(0,60);if(/^https?:\/\//.test(b.publicUrl||''))settings.publicUrl=String(b.publicUrl).replace(/\/+$/,'').slice(0,200);settings.gstPercent=Math.min(Math.max(Number(b.gstPercent)||0,0),28);settings.inclusive=!!b.inclusive;log(q.user.username,'settings','');r.json(settings)});
app.post('/api/calls/:id/done',auth('admin','waiter'),(q,r)=>{const c=calls.find(x=>x.id==q.params.id);if(c){c.done=true;c.reply=String(q.body.reply||'').slice(0,200)}io.to('staff').emit('call');r.json({ok:true})});
app.post('/api/admin/tables',auth('admin'),(q,r)=>{const n=Math.max(0,...tables.map(t=>t.number))+1;const t={number:n,token:crypto.randomBytes(16).toString('hex'),status:'available',seats:Number(q.body.seats)||4};tables.push(t);r.json(t)});
app.post('/api/admin/tables/:n/regen',auth('admin'),(q,r)=>{const t=tables.find(x=>x.number==q.params.n);if(!t)return r.sendStatus(404);t.token=crypto.randomBytes(16).toString('hex');log(q.user.username,'qr-regen',t.number);r.json(t)});
app.get('/api/admin/tables/:n/qr',auth('admin'),async(q,r)=>{const t=tables.find(x=>x.number==q.params.n);if(!t)return r.sendStatus(404);
 r.json({url:settings.publicUrl+'/?t='+t.token,img:await QR.toDataURL(String(settings.publicUrl)+'/?t='+t.token,{margin:1,width:300})})});
app.delete('/api/admin/menu/:id',auth('admin'),(q,r)=>{const i=menu.findIndex(x=>x.id==q.params.id);if(i>=0)menu.splice(i,1);r.json({ok:true})});
app.patch('/api/bookings/:id',auth('admin','pos','waiter'),(q,r)=>{const b=bookings.find(x=>x.id==q.params.id);if(!b)return r.sendStatus(404);
 if(['pending','confirmed','cancelled'].includes(q.body.status))b.status=q.body.status;if(q.body.date)b.date=String(q.body.date);if(q.body.slot)b.slot=String(q.body.slot).slice(0,40);if(q.body.table){b.table=q.body.table;const t=tables.find(x=>x.number==b.table);if(t&&b.status==='confirmed')t.status='reserved'}r.json(b)});
app.get('/api/inventory',auth('admin'),(q,r)=>r.json(ingredients));
app.post('/api/inventory',auth('admin'),(q,r)=>{const b=q.body;if(!b.name||!b.unit)return r.status(400).json({error:'name and unit required'});const x={id:iid++,name:String(b.name),unit:String(b.unit),stock:Number(b.stock)||0,low:Number(b.low)||0};ingredients.push(x);r.json(x)});
app.patch('/api/inventory/:id',auth('admin'),(q,r)=>{const x=ingredients.find(i=>i.id==q.params.id);if(!x)return r.sendStatus(404);x.stock=rd(x.stock+(Number(q.body.delta)||0));log(q.user.username,'stock',`${x.name} ${q.body.delta} ${q.body.reason||''}`);r.json(x)});
app.get('/api/admin/staff',auth('admin'),(q,r)=>r.json(users.map(u=>({username:u.username,role:u.role,active:u.active!==false}))));
app.post('/api/admin/staff',auth('admin'),(q,r)=>{const b=q.body;if(!/^[a-z0-9_.-]{3,30}$/i.test(b.username||'')||String(b.password||'').length<6||!['admin','kitchen','waiter','pos'].includes(b.role))return r.status(400).json({error:'username 3+ chars, password 6+ chars, valid role'});
 if(users.some(u=>u.username===b.username))return r.status(409).json({error:'username exists'});users.push({username:b.username,role:b.role,hash:bcrypt.hashSync(b.password,10),active:true});log(q.user.username,'staff+',b.username);r.json({ok:true})});
app.patch('/api/admin/staff/:u',auth('admin'),(q,r)=>{const u=users.find(x=>x.username===q.params.u);if(!u)return r.sendStatus(404);
 if('active' in q.body){if(u.username===q.user.username)return r.status(400).json({error:'cannot disable yourself'});u.active=!!q.body.active}
 if(q.body.password){if(String(q.body.password).length<6)return r.status(400).json({error:'password 6+ chars'});u.hash=bcrypt.hashSync(q.body.password,10)}r.json({ok:true})});
app.get('/api/admin/report2',auth('admin'),(q,r)=>{const p=orders.filter(o=>o.paid),cat={},meth={},best={};let sales=0,gst=0;
 p.forEach(o=>{const b=bill(o);sales+=o.payment.amount;gst+=b.gst;meth[o.payment.method]=rd((meth[o.payment.method]||0)+o.payment.amount);
  o.items.forEach(i=>{const m=menu.find(x=>x.id===i.menuId),c=(m&&m.category)||'Other';cat[c]=rd((cat[c]||0)+i.price*i.qty);best[i.name]=(best[i.name]||0)+i.qty})});
 r.json({orders:orders.length,paid:p.length,sales:rd(sales),gst:rd(gst),avg:p.length?rd(sales/p.length):0,byCategory:cat,byMethod:meth,best,bookings:bookings.length})});
app.get('/api/admin/report.csv',auth('admin'),(q,r)=>{const rows=['invoice,order,date,table,method,subtotal,discount,cgst,sgst,total'];
 orders.filter(o=>o.paid).forEach(o=>{const b=bill(o);rows.push([o.invoiceNo,o.id,new Date(o.payment.at).toISOString(),o.table||'takeaway',o.payment.method,b.subtotal,b.discount,b.cgst,b.sgst,o.payment.amount].join(','))});
 r.type('text/csv').send(rows.join('\n'))});

const notices=[];let nseq=1;
app.get('/api/live',auth(),(q,r)=>{const rl=q.user.role;r.json({orders:orders.map(o=>({...o,bill:bill(o)})),tables:tables.map(t=>({number:t.number,seats:t.seats,status:t.status})),
 calls:['admin','waiter','pos'].includes(rl)?calls.filter(c=>!c.done):[],notices:notices.filter(n=>!n.done&&(['admin','pos'].includes(rl)||n.to===rl)),bookings:rl==='kitchen'?[]:bookings,settings})});
app.post('/api/notices',auth('admin','pos','waiter'),(q,r)=>{const b=q.body;if(!b.text)return r.status(400).json({error:'message required'});
 const n={id:nseq++,text:String(b.text).slice(0,200),table:b.table||'',to:b.to==='waiter'?'waiter':'kitchen',from:q.user.username,t:Date.now(),done:false};notices.push(n);io.to('staff').emit('notice',n);r.json(n)});
app.post('/api/notices/:id/done',auth(),(q,r)=>{const n=notices.find(x=>x.id==q.params.id);if(n)n.done=true;io.to('staff').emit('notice');r.json({ok:true})});
app.get('/api/orders/:id/upiqr',auth('admin','pos'),async(q,r)=>{const o=orders.find(x=>x.id==q.params.id);if(!o)return r.sendStatus(404);
 if(!settings.upiId)return r.status(400).json({error:'Set your UPI ID in Settings first (admin)'});const b=bill(o);
 const u=`upi://pay?pa=${encodeURIComponent(settings.upiId)}&pn=${encodeURIComponent(settings.name)}&am=${b.total}&cu=INR&tn=${encodeURIComponent('Order '+o.id)}`;
 r.json({amount:b.total,img:await QR.toDataURL(u,{margin:1,width:240})})});
io.use((s,n)=>{const t=s.handshake.auth&&s.handshake.auth.token;if(!t)return n();try{s.user=jwt.verify(t,SECRET);n()}catch{n(new Error('auth'))}});
io.on('connection',s=>{if(s.user){s.join('staff');s.join(s.user.role)}});
const P=process.env.PORT||3000;srv.listen(P,()=>{console.log('Banke Bihari Cafe on :'+P);
 console.log('Staff login (phone/tablet/laptop): '+settings.publicUrl+'/staff');tables.forEach(t=>console.log(`Table ${t.number}: ${settings.publicUrl}/?t=${t.token}`));});
