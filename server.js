const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const app = express();

const DATA_DIR = path.join(__dirname, 'data');

// --- JSON Database helpers ---
function readDB(name) {
  const p = path.join(DATA_DIR, name + '.json');
  if (!fs.existsSync(p)) fs.writeFileSync(p, '[]');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function writeDB(name, data) {
  fs.writeFileSync(path.join(DATA_DIR, name + '.json'), JSON.stringify(data, null, 2));
}

// Initialize data files
['titanes', 'cargas', 'energia', 'pagos', 'mensajes'].forEach(f => {
  const p = path.join(DATA_DIR, f + '.json');
  if (!fs.existsSync(p)) fs.writeFileSync(p, '[]');
});

// Create admin user if not exists
const admins = readDB('admin');
if (admins.length === 0) {
  admins.push({ username: 'admin', password: bcrypt.hashSync('taureon2026', 10) });
  writeDB('admin', admins);
}

// --- Middleware ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'taureon-secret-key-2026',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// --- Auth helpers ---
function requireAdmin(req, res, next) {
  if (!req.session.admin) return res.redirect('/admin/login');
  next();
}
function requireTitan(req, res, next) {
  if (!req.session.titan) return res.redirect('/titan/login');
  next();
}

// ============================================================
// ADMIN ROUTES
// ============================================================

// Login
app.get('/admin/login', (req, res) => {
  res.render('admin/login', { error: null });
});
app.post('/admin/login', (req, res) => {
  const admins = readDB('admin');
  const admin = admins.find(a => a.username === req.body.username);
  if (admin && bcrypt.compareSync(req.body.password, admin.password)) {
    req.session.admin = true;
    return res.redirect('/admin/dashboard');
  }
  res.render('admin/login', { error: 'Credenciales incorrectas' });
});
app.get('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// Dashboard
app.get('/admin/dashboard', requireAdmin, (req, res) => {
  const titanes = readDB('titanes');
  const pagos = readDB('pagos');
  const cargas = readDB('cargas');
  const hoy = new Date();
  const hoyStr = hoy.toISOString().split('T')[0];

  const totalTitanes = titanes.length;
  const activos = titanes.filter(t => t.activo).length;
  const pagosVencidos = pagos.filter(p => p.fechaVencimiento && p.fechaVencimiento < hoyStr && !p.pagado).length;
  const cumpleanosHoy = titanes.filter(t => {
    if (!t.cumpleanos) return false;
    const [m, d] = t.cumpleanos.split('-');
    return parseInt(m) === hoy.getMonth() + 1 && parseInt(d) === hoy.getDate();
  });

  res.render('admin/dashboard', { titanes, pagos, totalTitanes, activos, pagosVencidos, cumpleanosHoy, cargas, hoyStr });
});

// List Titanes
app.get('/admin/titanes', requireAdmin, (req, res) => {
  const titanes = readDB('titanes');
  res.render('admin/titanes', { titanes });
});

// Nuevo Titán
app.get('/admin/titanes/nuevo', requireAdmin, (req, res) => {
  res.render('admin/titan-form', { titan: null, error: null });
});
app.post('/admin/titanes/nuevo', requireAdmin, (req, res) => {
  const titanes = readDB('titanes');
  const { nombre, usuario, password, telefono, cumpleanos, objetivos, notas } = req.body;
  if (titanes.find(t => t.usuario === usuario)) {
    return res.render('admin/titan-form', { titan: null, error: 'El usuario ya existe' });
  }
  const newTitan = {
    id: Date.now().toString(36),
    nombre, usuario, telefono, cumpleanos, objetivos: objetivos || '', notas: notas || '',
    activo: true,
    password: bcrypt.hashSync(password, 10),
    fechaCreacion: new Date().toISOString().split('T')[0]
  };
  titanes.push(newTitan);
  writeDB('titanes', titanes);
  res.redirect('/admin/titanes');
});

// Editar Titán
app.get('/admin/titanes/:id', requireAdmin, (req, res) => {
  const titanes = readDB('titanes');
  const titan = titanes.find(t => t.id === req.params.id);
  if (!titan) return res.redirect('/admin/titanes');
  res.render('admin/titan-form', { titan, error: null });
});
app.post('/admin/titanes/:id', requireAdmin, (req, res) => {
  const titanes = readDB('titanes');
  const idx = titanes.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.redirect('/admin/titanes');
  const { nombre, telefono, cumpleanos, objetivos, notas, activo } = req.body;
  titanes[idx].nombre = nombre;
  titanes[idx].telefono = telefono;
  titanes[idx].cumpleanos = cumpleanos;
  titanes[idx].objetivos = objetivos || '';
  titanes[idx].notas = notas || '';
  titanes[idx].activo = activo === 'on' || activo === true;
  if (req.body.password) {
    titanes[idx].password = bcrypt.hashSync(req.body.password, 10);
  }
  writeDB('titanes', titanes);
  res.redirect('/admin/titanes');
});

// Eliminar Titán
app.post('/admin/titanes/:id/eliminar', requireAdmin, (req, res) => {
  let titanes = readDB('titanes');
  titanes = titanes.filter(t => t.id !== req.params.id);
  writeDB('titanes', titanes);
  res.redirect('/admin/titanes');
});

// --- Cargas por Titán ---
app.get('/admin/titanes/:id/cargas', requireAdmin, (req, res) => {
  const titanes = readDB('titanes');
  const titan = titanes.find(t => t.id === req.params.id);
  if (!titan) return res.redirect('/admin/titanes');
  const cargas = readDB('cargas').filter(c => c.titanId === req.params.id);
  res.render('admin/cargas', { titan, cargas });
});
app.post('/admin/titanes/:id/cargas', requireAdmin, (req, res) => {
  const cargas = readDB('cargas');
  const { fecha, ejercicio, carga, repeticiones, series, notas } = req.body;
  cargas.push({
    id: Date.now().toString(36),
    titanId: req.params.id, fecha, ejercicio, carga: parseFloat(carga),
    repeticiones: parseInt(repeticiones), series: parseInt(series),
    notas: notas || '', createdAt: new Date().toISOString()
  });
  writeDB('cargas', cargas);
  res.redirect('/admin/titanes/' + req.params.id + '/cargas');
});

// --- Energía por Titán ---
app.get('/admin/titanes/:id/energia', requireAdmin, (req, res) => {
  const titanes = readDB('titanes');
  const titan = titanes.find(t => t.id === req.params.id);
  if (!titan) return res.redirect('/admin/titanes');
  const energia = readDB('energia').filter(e => e.titanId === req.params.id);
  res.render('admin/energia', { titan, energia });
});
app.post('/admin/titanes/:id/energia', requireAdmin, (req, res) => {
  const energia = readDB('energia');
  const { fecha, nivel, notas } = req.body;
  energia.push({
    id: Date.now().toString(36),
    titanId: req.params.id, fecha, nivel: parseInt(nivel),
    notas: notas || '', createdAt: new Date().toISOString()
  });
  writeDB('energia', energia);
  res.redirect('/admin/titanes/' + req.params.id + '/energia');
});

// --- Pagos ---
app.get('/admin/pagos', requireAdmin, (req, res) => {
  const titanes = readDB('titanes');
  const pagos = readDB('pagos');
  const hoy = new Date().toISOString().split('T')[0];
  res.render('admin/pagos', { titanes, pagos, hoy });
});
app.post('/admin/pagos/agregar', requireAdmin, (req, res) => {
  const pagos = readDB('pagos');
  const { titanId, monto, fechaVencimiento, concepto } = req.body;
  pagos.push({
    id: Date.now().toString(36),
    titanId, monto: parseFloat(monto), fechaVencimiento,
    concepto: concepto || 'Mensualidad',
    pagado: false, fechaPago: null, createdAt: new Date().toISOString()
  });
  writeDB('pagos', pagos);
  res.redirect('/admin/pagos');
});
app.post('/admin/pagos/:id/pagar', requireAdmin, (req, res) => {
  const pagos = readDB('pagos');
  const idx = pagos.findIndex(p => p.id === req.params.id);
  if (idx !== -1) {
    pagos[idx].pagado = true;
    pagos[idx].fechaPago = new Date().toISOString().split('T')[0];
    writeDB('pagos', pagos);
  }
  res.redirect('/admin/pagos');
});

// --- Mensajes / Chat ---
app.get('/admin/mensajes', requireAdmin, (req, res) => {
  const titanes = readDB('titanes');
  const mensajes = readDB('mensajes');
  res.render('admin/mensajes', { titanes, mensajes });
});
app.get('/admin/mensajes/:titanId', requireAdmin, (req, res) => {
  const titanes = readDB('titanes');
  const titan = titanes.find(t => t.id === req.params.titanId);
  if (!titan) return res.redirect('/admin/mensajes');
  const mensajes = readDB('mensajes').filter(m =>
    (m.de === 'admin' && m.para === req.params.titanId) ||
    (m.de === req.params.titanId && m.para === 'admin')
  ).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  res.render('admin/chat', { titan, mensajes });
});
app.post('/admin/mensajes/:titanId', requireAdmin, (req, res) => {
  const mensajes = readDB('mensajes');
  mensajes.push({
    id: Date.now().toString(36),
    de: 'admin', para: req.params.titanId,
    texto: req.body.texto, leido: false,
    createdAt: new Date().toISOString()
  });
  writeDB('mensajes', mensajes);
  res.redirect('/admin/mensajes/' + req.params.titanId);
});

// ============================================================
// TITÁN ROUTES
// ============================================================

app.get('/titan/login', (req, res) => {
  res.render('titan/login', { error: null });
});
app.post('/titan/login', (req, res) => {
  const titanes = readDB('titanes');
  const titan = titanes.find(t => t.usuario === req.body.usuario && t.activo);
  if (titan && bcrypt.compareSync(req.body.password, titan.password)) {
    req.session.titan = titan.id;
    return res.redirect('/titan/dashboard');
  }
  res.render('titan/login', { error: 'Usuario o contraseña incorrectos' });
});
app.get('/titan/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/titan/login');
});

app.get('/titan/dashboard', requireTitan, (req, res) => {
  const titanes = readDB('titanes');
  const titan = titanes.find(t => t.id === req.session.titan);
  const cargas = readDB('cargas').filter(c => c.titanId === titan.id);
  const energia = readDB('energia').filter(e => e.titanId === titan.id);
  const mensajes = readDB('mensajes').filter(m => m.de === titan.id || m.para === titan.id);
  const noLeidos = mensajes.filter(m => m.de === 'admin' && !m.leido).length;
  res.render('titan/dashboard', { titan, cargas, energia, mensajes, noLeidos });
});

app.get('/titan/cargas', requireTitan, (req, res) => {
  const titanes = readDB('titanes');
  const titan = titanes.find(t => t.id === req.session.titan);
  const cargas = readDB('cargas').filter(c => c.titanId === titan.id);
  res.render('titan/cargas', { titan, cargas });
});

app.post('/titan/cargas', requireTitan, (req, res) => {
  const cargas = readDB('cargas');
  const { fecha, ejercicio, carga, repeticiones, series, notas } = req.body;
  cargas.push({
    id: Date.now().toString(36),
    titanId: req.session.titan, fecha, ejercicio,
    carga: parseFloat(carga), repeticiones: parseInt(repeticiones),
    series: parseInt(series), notas: notas || '',
    createdAt: new Date().toISOString(), auto: true
  });
  writeDB('cargas', cargas);
  res.redirect('/titan/cargas');
});

app.get('/titan/energia', requireTitan, (req, res) => {
  const titanes = readDB('titanes');
  const titan = titanes.find(t => t.id === req.session.titan);
  const energia = readDB('energia').filter(e => e.titanId === titan.id);
  res.render('titan/energia', { titan, energia });
});

app.post('/titan/energia', requireTitan, (req, res) => {
  const energia = readDB('energia');
  const { fecha, nivel, notas } = req.body;
  energia.push({
    id: Date.now().toString(36), titanId: req.session.titan,
    fecha, nivel: parseInt(nivel), notas: notas || '',
    createdAt: new Date().toISOString(), auto: true
  });
  writeDB('energia', energia);
  res.redirect('/titan/energia');
});

app.get('/titan/mensajes', requireTitan, (req, res) => {
  const titanes = readDB('titanes');
  const titan = titanes.find(t => t.id === req.session.titan);
  const mensajes = readDB('mensajes').filter(m =>
    m.de === 'admin' && m.para === titan.id
  ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.render('titan/mensajes', { titan, mensajes });
});

app.get('/titan/progreso', requireTitan, (req, res) => {
  const titanes = readDB('titanes');
  const titan = titanes.find(t => t.id === req.session.titan);
  const cargas = readDB('cargas').filter(c => c.titanId === titan.id);
  const energia = readDB('energia').filter(e => e.titanId === titan.id);
  res.render('titan/progreso', { titan, cargas, energia });
});

// ============================================================
// SETTINGS (admin password change)
// ============================================================
app.get('/admin/settings', requireAdmin, (req, res) => {
  res.render('admin/settings', { error: null, success: null });
});
app.post('/admin/settings', requireAdmin, (req, res) => {
  const admins = readDB('admin');
  const admin = admins.find(a => a.username === 'admin');
  if (req.body.newPassword && req.body.newPassword.length >= 4) {
    admin.password = bcrypt.hashSync(req.body.newPassword, 10);
    writeDB('admin', admins);
    return res.render('admin/settings', { error: null, success: 'Contraseña actualizada' });
  }
  res.render('admin/settings', { error: 'La contraseña debe tener al menos 4 caracteres', success: null });
});

// ============================================================
// Export / Backup
// ============================================================
app.get('/admin/exportar', requireAdmin, (req, res) => {
  const data = {
    titanes: readDB('titanes'),
    pagos: readDB('pagos'),
    cargas: readDB('cargas').length,
    energia: readDB('energia').length,
    mensajes: readDB('mensajes').length
  };
  res.json(data);
});

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('TAUREON Titanes corriendo en puerto ' + PORT);
});
