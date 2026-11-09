require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const STORAGE_DIR = path.join(ROOT, 'storage');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const DB_FILE = path.join(STORAGE_DIR, 'db.json');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

for (const directory of [STORAGE_DIR, UPLOAD_DIR]) {
  fs.mkdirSync(directory, { recursive: true });
}

function makeId() {
  return crypto.randomUUID();
}

function readDatabase() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not read database:', error);
    return { users: [], courses: [], tutorials: [], posts: [] };
  }
}

let database = readDatabase();

function saveDatabase() {
  const temporaryFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(database, null, 2));
  fs.renameSync(temporaryFile, DB_FILE);
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    enrolledCourses: user.enrolledCourses || []
  };
}

function seedDatabase() {
  const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@worldofhacker.in').trim().toLowerCase();
  const adminPassword = String(process.env.ADMIN_PASSWORD || 'WOHAdmin@2026');
  const adminName = String(process.env.ADMIN_NAME || 'WOH Admin').trim();
  let changed = false;

  if (!Array.isArray(database.posts)) { database.posts = []; changed = true; }

  if (!database.users.some(user => user.email === adminEmail)) {
    database.users.push({
      id: makeId(),
      name: adminName,
      email: adminEmail,
      passwordHash: bcrypt.hashSync(adminPassword, 12),
      role: 'admin',
      status: 'active',
      isSeedAdmin: true,
      createdAt: new Date().toISOString(),
      enrolledCourses: []
    });
    changed = true;
  }

  if (database.courses.length === 0) {
    database.courses = [
      {
        id: makeId(),
        title: 'Cybersecurity Foundations',
        description: 'Understand core security concepts, digital safety, common terminology, and how defenders think about protecting systems.',
        category: 'Cybersecurity',
        level: 'Beginner',
        duration: '2 hours',
        file: null,
        createdAt: new Date().toISOString()
      },
      {
        id: makeId(),
        title: 'Linux & Command Line Basics',
        description: 'Build confidence with the Linux terminal, files, folders, permissions, and everyday command-line workflows.',
        category: 'Linux',
        level: 'Beginner',
        duration: '3 hours',
        file: null,
        createdAt: new Date().toISOString()
      },
      {
        id: makeId(),
        title: 'Web Technology & HTTP',
        description: 'Learn how browsers, servers, requests, responses, cookies, and web applications fit together.',
        category: 'Web Security',
        level: 'Beginner',
        duration: '2.5 hours',
        file: null,
        createdAt: new Date().toISOString()
      }
    ];
    changed = true;
  }

  if (database.tutorials.length === 0) {
    database.tutorials = [
      {
        id: makeId(),
        title: 'Set Up a Safe Practice Lab',
        description: 'A beginner-friendly overview of isolated practice environments and responsible learning habits.',
        category: 'Lab Setup',
        duration: '12 min',
        file: null,
        createdAt: new Date().toISOString()
      },
      {
        id: makeId(),
        title: 'Understanding an HTTP Request',
        description: 'Explore the structure of a web request and what its common headers communicate.',
        category: 'Web Basics',
        duration: '9 min',
        file: null,
        createdAt: new Date().toISOString()
      },
      {
        id: makeId(),
        title: 'Reading Security Scan Reports',
        description: 'Learn how to interpret findings, understand severity labels, and document issues responsibly.',
        category: 'Security Basics',
        duration: '15 min',
        file: null,
        createdAt: new Date().toISOString()
      }
    ];
    changed = true;
  }

  if (changed) saveDatabase();
}

seedDatabase();

app.disable('x-powered-by');
if (IS_PRODUCTION) app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      mediaSrc: ["'self'"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.use(session({
  name: 'woh.sid',
  secret: process.env.SESSION_SECRET || 'development-only-change-this-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PRODUCTION,
    maxAge: 1000 * 60 * 60 * 8
  }
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' }
});

const allowedExtensions = new Set(['.pdf', '.zip', '.txt', '.mp4', '.webm', '.jpg', '.jpeg', '.png', '.webp', '.gif']);
const allowedMimeTypes = new Set([
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
  'text/plain',
  'video/mp4',
  'video/webm',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, UPLOAD_DIR),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 12);
    callback(null, `${makeId()}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(extension) || !allowedMimeTypes.has(file.mimetype)) {
      return callback(new Error('Unsupported file type. Use PDF, MP4, WEBM, ZIP, TXT, JPG, PNG, WEBP, or GIF.'));
    }
    callback(null, true);
  }
});

function getCurrentUser(req) {
  return database.users.find(user => user.id === req.session.userId) || null;
}


function establishSession(req, userId) {
  return new Promise((resolve, reject) => {
    req.session.regenerate(error => {
      if (error) return reject(error);
      req.session.userId = userId;
      req.session.save(saveError => saveError ? reject(saveError) : resolve());
    });
  });
}

function requireAuth(req, res, next) {
  const user = getCurrentUser(req);
  if (!user || user.status !== 'active') {
    return res.status(401).json({ error: 'Please sign in to continue.' });
  }
  req.currentUser = user;
  next();
}

function requireAdmin(req, res, next) {
  const user = getCurrentUser(req);
  if (!user || user.status !== 'active') {
    return res.status(401).json({ error: 'Please sign in to continue.' });
  }
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access is required.' });
  }
  req.currentUser = user;
  next();
}

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function attachmentInfo(file) {
  if (!file) return null;
  return {
    name: path.basename(file.originalname).slice(0, 160),
    storedName: file.filename,
    url: `/uploads/${encodeURIComponent(file.filename)}`,
    size: file.size,
    mimeType: file.mimetype
  };
}

function removeAttachment(file) {
  if (!file || !file.storedName) return;
  const safeName = path.basename(file.storedName);
  const fullPath = path.join(UPLOAD_DIR, safeName);
  if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
}

function makeResource(req, type, existing = null) {
  const title = cleanText(req.body.title, 100);
  const description = cleanText(req.body.description, 1200);
  const category = cleanText(req.body.category, 60) || (type === 'course' ? 'General' : 'Tutorial');
  const duration = cleanText(req.body.duration, 40);
  if (!title || !description) {
    const error = new Error('Please enter both a title and a description.');
    error.status = 400;
    throw error;
  }
  const file = req.file ? attachmentInfo(req.file) : (existing ? existing.file : null);
  if (req.file && existing && existing.file) removeAttachment(existing.file);
  const resource = {
    id: existing ? existing.id : makeId(),
    title,
    description,
    category,
    duration,
    file,
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (type === 'course') resource.level = cleanText(req.body.level, 30) || 'Beginner';
  return resource;
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok', app: 'WORLD OF HACKER 0.1' }));

app.post('/api/auth/signup', authLimiter, async (req, res, next) => {
  try {
    const name = cleanText(req.body.name, 70);
    const email = cleanText(req.body.email, 160).toLowerCase();
    const password = String(req.body.password || '');
    if (name.length < 2) return res.status(400).json({ error: 'Please enter your name.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (password.length < 8 || password.length > 72) return res.status(400).json({ error: 'Password must be 8 to 72 characters long.' });
    if (database.users.some(user => user.email === email)) return res.status(409).json({ error: 'An account with this email already exists.' });

    const user = {
      id: makeId(),
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'student',
      status: 'active',
      isSeedAdmin: false,
      createdAt: new Date().toISOString(),
      enrolledCourses: []
    };
    database.users.push(user);
    saveDatabase();
    await establishSession(req, user.id);
    res.status(201).json({ user: publicUser(user) });
  } catch (error) { next(error); }
});

app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  try {
    const email = cleanText(req.body.email, 160).toLowerCase();
    const password = String(req.body.password || '');
    const user = database.users.find(item => item.email === email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    if (user.status !== 'active') return res.status(403).json({ error: 'This account is currently suspended. Contact an administrator.' });
    await establishSession(req, user.id);
    res.json({ user: publicUser(user) });
  } catch (error) { next(error); }
});

app.post('/api/auth/logout', (req, res, next) => {
  req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie('woh.sid', { httpOnly: true, sameSite: 'lax', secure: IS_PRODUCTION });
    res.json({ ok: true });
  });
});

app.get('/api/auth/me', (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.status !== 'active') return res.json({ user: null });
  res.json({ user: publicUser(user) });
});

app.get('/api/courses', (req, res) => {
  const user = getCurrentUser(req);
  const courses = database.courses.map(course => ({
    ...course,
    enrolled: Boolean(user && (user.enrolledCourses || []).includes(course.id))
  }));
  res.json({ courses });
});

app.get('/api/tutorials', (_req, res) => res.json({ tutorials: database.tutorials }));
app.get('/api/posts', (_req, res) => res.json({ posts: database.posts }));

app.post('/api/courses/:id/enroll', requireAuth, (req, res) => {
  const course = database.courses.find(item => item.id === req.params.id);
  if (!course) return res.status(404).json({ error: 'Course not found.' });
  const enrolled = req.currentUser.enrolledCourses || [];
  if (!enrolled.includes(course.id)) enrolled.push(course.id);
  req.currentUser.enrolledCourses = enrolled;
  saveDatabase();
  res.json({ user: publicUser(req.currentUser), enrolled: true });
});

app.get('/api/admin/stats', requireAdmin, (_req, res) => {
  res.json({
    users: database.users.length,
    activeUsers: database.users.filter(user => user.status === 'active').length,
    courses: database.courses.length,
    tutorials: database.tutorials.length,
    posts: database.posts.length,
    enrollments: database.users.reduce((total, user) => total + (user.enrolledCourses || []).length, 0)
  });
});

app.get('/api/admin/users', requireAdmin, (_req, res) => {
  res.json({ users: database.users.map(publicUser).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
});

app.patch('/api/admin/users/:id', requireAdmin, (req, res) => {
  const user = database.users.find(item => item.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.id === req.currentUser.id && req.body.status === 'suspended') {
    return res.status(400).json({ error: 'You cannot suspend your own account.' });
  }
  if (user.id === req.currentUser.id && req.body.role && req.body.role !== 'admin') {
    return res.status(400).json({ error: 'You cannot remove administrator access from your own account.' });
  }
  if (user.isSeedAdmin && req.body.role && req.body.role !== 'admin') {
    return res.status(400).json({ error: 'The primary demo administrator role is protected.' });
  }
  if (['active', 'suspended'].includes(req.body.status)) user.status = req.body.status;
  if (['student', 'admin'].includes(req.body.role) && !user.isSeedAdmin) user.role = req.body.role;
  saveDatabase();
  res.json({ user: publicUser(user) });
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const user = database.users.find(item => item.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.id === req.currentUser.id || user.isSeedAdmin) {
    return res.status(400).json({ error: 'The primary administrator account cannot be deleted.' });
  }
  database.users = database.users.filter(item => item.id !== user.id);
  saveDatabase();
  res.json({ ok: true });
});

function addResourceRoutes(type) {
  const collection = type === 'course' ? 'courses' : 'tutorials';
  const base = `/api/admin/${collection}`;

  app.post(base, requireAdmin, upload.single('attachment'), (req, res, next) => {
    try {
      const item = makeResource(req, type);
      database[collection].unshift(item);
      saveDatabase();
      res.status(201).json({ [type]: item });
    } catch (error) {
      if (req.file) removeAttachment({ storedName: req.file.filename });
      next(error);
    }
  });

  app.patch(`${base}/:id`, requireAdmin, upload.single('attachment'), (req, res, next) => {
    try {
      const index = database[collection].findIndex(item => item.id === req.params.id);
      if (index < 0) {
        if (req.file) removeAttachment({ storedName: req.file.filename });
        return res.status(404).json({ error: `${type} not found.` });
      }
      const item = makeResource(req, type, database[collection][index]);
      database[collection][index] = item;
      saveDatabase();
      res.json({ [type]: item });
    } catch (error) {
      if (req.file) removeAttachment({ storedName: req.file.filename });
      next(error);
    }
  });

  app.delete(`${base}/:id`, requireAdmin, (req, res) => {
    const item = database[collection].find(entry => entry.id === req.params.id);
    if (!item) return res.status(404).json({ error: `${type} not found.` });
    removeAttachment(item.file);
    database[collection] = database[collection].filter(entry => entry.id !== item.id);
    if (type === 'course') {
      for (const user of database.users) {
        user.enrolledCourses = (user.enrolledCourses || []).filter(id => id !== item.id);
      }
    }
    saveDatabase();
    res.json({ ok: true });
  });
}

addResourceRoutes('course');
addResourceRoutes('tutorial');


function makeMediaPost(req, existing = null) {
  const caption = cleanText(req.body.caption, 1800);
  const title = cleanText(req.body.title, 100) || (caption ? caption.slice(0, 72) : 'Creator update');
  if (!caption) {
    const error = new Error('Please add a caption or message for this post.');
    error.status = 400;
    throw error;
  }

  let media = existing ? existing.media : null;
  let mediaType = existing ? existing.mediaType : 'text';
  if (req.file) {
    const mime = String(req.file.mimetype || '').toLowerCase();
    const extension = path.extname(req.file.originalname).toLowerCase();
    const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    const videoTypes = new Set(['video/mp4', 'video/webm']);
    const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
    const videoExtensions = new Set(['.mp4', '.webm']);
    const isImage = imageTypes.has(mime) && imageExtensions.has(extension);
    const isVideo = videoTypes.has(mime) && videoExtensions.has(extension);
    if (!isImage && !isVideo) {
      removeAttachment({ storedName: req.file.filename });
      const error = new Error('Please upload a JPG, PNG, WEBP photo or MP4, WEBM video.');
      error.status = 400;
      throw error;
    }
    if (existing && existing.media) removeAttachment(existing.media);
    media = attachmentInfo(req.file);
    mediaType = isImage ? 'image' : 'video';
  }

  return {
    id: existing ? existing.id : makeId(),
    title,
    caption,
    media,
    mediaType,
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

app.post('/api/admin/posts', requireAdmin, upload.single('attachment'), (req, res, next) => {
  try {
    const post = makeMediaPost(req);
    database.posts.unshift(post);
    saveDatabase();
    res.status(201).json({ post });
  } catch (error) {
    if (req.file && fs.existsSync(path.join(UPLOAD_DIR, req.file.filename))) removeAttachment({ storedName: req.file.filename });
    next(error);
  }
});

app.patch('/api/admin/posts/:id', requireAdmin, upload.single('attachment'), (req, res, next) => {
  try {
    const index = database.posts.findIndex(item => item.id === req.params.id);
    if (index < 0) {
      if (req.file) removeAttachment({ storedName: req.file.filename });
      return res.status(404).json({ error: 'Post not found.' });
    }
    const post = makeMediaPost(req, database.posts[index]);
    database.posts[index] = post;
    saveDatabase();
    res.json({ post });
  } catch (error) {
    if (req.file && fs.existsSync(path.join(UPLOAD_DIR, req.file.filename))) removeAttachment({ storedName: req.file.filename });
    next(error);
  }
});

app.delete('/api/admin/posts/:id', requireAdmin, (req, res) => {
  const post = database.posts.find(item => item.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  removeAttachment(post.media);
  database.posts = database.posts.filter(item => item.id !== post.id);
  saveDatabase();
  res.json({ ok: true });
});

app.use('/uploads', express.static(UPLOAD_DIR, {
  dotfiles: 'deny',
  index: false,
  maxAge: IS_PRODUCTION ? '1h' : 0,
  setHeaders: (res, filePath) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const extension = path.extname(filePath).toLowerCase();
    const inlineMedia = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.webm']);
    const disposition = inlineMedia.has(extension) ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${disposition}; filename="${path.basename(filePath)}"`);
  }
}));

app.use(express.static(PUBLIC_DIR));
app.get('*', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'File is too large. Maximum upload size is 100 MB.' : 'The upload could not be processed.';
    return res.status(400).json({ error: message });
  }
  const status = Number(error.status) || 500;
  res.status(status).json({ error: status === 500 ? 'Something went wrong on the server.' : error.message });
});

app.listen(PORT, () => {
  console.log(`\n  WORLD OF HACKER 0.1 is running at http://localhost:${PORT}`);
  console.log(`  Demo admin: ${process.env.ADMIN_EMAIL || 'admin@worldofhacker.in'}`);
  console.log('  Change the demo password and SESSION_SECRET before public deployment.\n');
});
