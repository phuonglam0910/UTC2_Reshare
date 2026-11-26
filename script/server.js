'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const dataDir = path.join(ROOT, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'reshare.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK(role IN ('student', 'guest', 'admin')),
    student_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK(status IN ('active', 'locked')) DEFAULT 'active',
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

// Some Node/SQLite builds may create this project database before a later
// password_salt column definition; ensure both schema variants work.
try {
  db.prepare('SELECT password_salt FROM users LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE users ADD COLUMN password_salt TEXT NOT NULL DEFAULT ""');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, storedHash) {
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(storedHash, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function seedUser(email, password, fullName, role, studentId) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return;
  const credentials = hashPassword(password);
  db.prepare(`
    INSERT INTO users (id, full_name, email, role, student_id, status, password_hash, password_salt, created_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
  `).run(
    role === 'admin' ? 'admin' : 'seed_' + crypto.randomUUID(),
    fullName,
    email,
    role,
    studentId,
    credentials.hash,
    credentials.salt,
    new Date().toISOString()
  );
}

seedUser('admin@st.utc2.edu.vn', 'admin123**', 'Quản trị viên', 'admin', 'AD001');
seedUser('nguyenvanan@gmail.com', 'utc2@123', 'Nguyễn Văn An', 'student', '6251071025');
seedUser('tranvanbinh@gmail.com', 'utc2@12345', 'Trần Văn Bình', 'student', '6251071089');

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

function userResponse(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    studentId: row.student_id,
    status: row.status,
    createdAt: row.created_at
  };
}

async function handleApi(req, res, url) {
  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    let body;
    try {
      body = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { message: error.message });
      return;
    }

    const fullName = String(body.fullName || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const role = body.role === 'guest' ? 'guest' : 'student';
    const studentId = String(body.studentId || '').trim();
    const password = String(body.password || '');

    if (fullName.length < 2) {
      sendJson(res, 400, { message: 'Họ và tên tối thiểu 2 ký tự.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      sendJson(res, 400, { message: 'Email không đúng định dạng.' });
      return;
    }
    if (password.length < 8) {
      sendJson(res, 400, { message: 'Mật khẩu phải có tối thiểu 8 ký tự.' });
      return;
    }
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
      sendJson(res, 409, { message: 'Email này đã được sử dụng.' });
      return;
    }

    const credentials = hashPassword(password);
    const id = 'user_' + crypto.randomUUID();
    db.prepare(`
      INSERT INTO users (id, full_name, email, role, student_id, status, password_hash, password_salt, created_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `).run(id, fullName, email, role, studentId, credentials.hash, credentials.salt, new Date().toISOString());

    sendJson(res, 201, { user: userResponse(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    let body;
    try {
      body = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { message: error.message });
      return;
    }

    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!row || !verifyPassword(password, row.password_salt, row.password_hash)) {
      sendJson(res, 401, { message: 'Email hoặc mật khẩu không chính xác.' });
      return;
    }
    if (row.status === 'locked') {
      sendJson(res, 423, { message: 'Tài khoản này đã bị khóa.' });
      return;
    }
    sendJson(res, 200, { user: userResponse(row) });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/users') {
    const rows = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
    sendJson(res, 200, { users: rows.map(userResponse) });
    return;
  }

  const statusMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/status$/);
  if (req.method === 'PATCH' && statusMatch) {
    const id = decodeURIComponent(statusMatch[1]);
    let body;
    try {
      body = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { message: error.message });
      return;
    }
    if (!['active', 'locked'].includes(body.status)) {
      sendJson(res, 400, { message: 'Trạng thái không hợp lệ.' });
      return;
    }
    const result = db.prepare('UPDATE users SET status = ? WHERE id = ?').run(body.status, id);
    if (result.changes === 0) {
      sendJson(res, 404, { message: 'Không tìm thấy tài khoản.' });
      return;
    }
    sendJson(res, 200, { user: userResponse(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
    return;
  }

  sendJson(res, 404, { message: 'Không tìm thấy API.' });
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch(error => {
      console.error('[API]', error);
      sendJson(res, 500, { message: 'Không thể xử lý yêu cầu.' });
    });
    return;
  }

  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.resolve(ROOT, '.' + pathname);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    sendJson(res, 403, { message: 'Truy cập bị từ chối.' });
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendJson(res, error.code === 'ENOENT' ? 404 : 500, {
        message: error.code === 'ENOENT' ? 'Không tìm thấy trang.' : 'Không thể đọc trang.'
      });
      return;
    }
    res.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`UTC2 Reshare đang chạy tại http://127.0.0.1:${PORT}`);
  console.log(`SQLite database: ${path.join(dataDir, 'reshare.db')}`);
});
