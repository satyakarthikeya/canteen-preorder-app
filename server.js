const express = require('express');
const fs = require('fs');
const path = require('path');
const dns = require('dns');
const nodemailer = require('nodemailer');
const multer = require('multer');
const Tesseract = require('tesseract.js');

require('dotenv').config();

dns.setDefaultResultOrder('ipv4first');

const app = express();
const port = process.env.PORT || 3000;
const dataPath = path.join(__dirname, 'data');
const upload = multer({ storage: multer.memoryStorage() });
const pendingRegistrationsFile = 'pendingRegistrations.json';
const adminPanelPassword = process.env.ADMIN_PANEL_PASSWORD || 'admin123';
let smtpTransporter;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readData(fileName) {
  return JSON.parse(fs.readFileSync(path.join(dataPath, fileName), 'utf-8'));
}

function writeData(fileName, data) {
  fs.writeFileSync(path.join(dataPath, fileName), JSON.stringify(data, null, 2), 'utf-8');
}

function readDataOrDefault(fileName, fallback) {
  const file = path.join(dataPath, fileName);
  if (!fs.existsSync(file)) {
    writeData(fileName, fallback);
    return fallback;
  }
  return readData(fileName);
}

app.get('/api/canteens', (req, res) => {
  const canteens = readData('canteens.json');
  res.json(canteens);
});

app.get('/api/menu', (req, res) => {
  const { canteenId } = req.query;
  const menu = readData('menu.json');
  res.json(menu.filter(item => item.canteenId === canteenId));
});

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function normalizeMenuItemName(name) {
  return String(name || '')
    .replace(/[|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMenuItemsFromText(rawText) {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map(line => line.replace(/\t/g, ' ').trim())
    .filter(Boolean);

  const extracted = [];
  const seen = new Set();

  lines.forEach(line => {
    const cleaned = line.replace(/\s{2,}/g, ' ').trim();

    const match = cleaned.match(/^(?:\d+[.)-]?\s*)?(.+?)\s*(?:-|:|\.)?\s*(?:₹|rs\.?|inr)?\s*(\d{1,4})(?:\.\d{1,2})?$/i);
    if (!match) return;

    const name = normalizeMenuItemName(match[1]);
    const price = Number(match[2]);

    if (!name || name.length < 2 || name.length > 70) return;
    if (!Number.isFinite(price) || price <= 0 || price > 5000) return;

    const key = `${name.toLowerCase()}::${price}`;
    if (seen.has(key)) return;

    seen.add(key);
    extracted.push({ name, price });
  });

  return extracted;
}

function getOwnerFromId(ownerId) {
  const owners = readData('owners.json');
  return owners.find(owner => owner.id === ownerId);
}

function isAdminAuthorized(password) {
  return Boolean(password) && password === adminPanelPassword;
}

function escapeCsvCell(value) {
  const text = String(value == null ? '' : value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildMenuCsv(rows) {
  const header = ['name', 'price', 'status'];
  const lines = [header.join(',')];
  rows.forEach(row => {
    lines.push([
      escapeCsvCell(row.name),
      escapeCsvCell(row.price),
      escapeCsvCell(row.status || 'available')
    ].join(','));
  });
  return lines.join('\n');
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function parseMenuCsv(csvText) {
  const lines = String(csvText || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase());
  const nameIndex = headers.indexOf('name');
  const priceIndex = headers.indexOf('price');
  const statusIndex = headers.indexOf('status');

  if (nameIndex === -1 || priceIndex === -1) {
    return [];
  }

  const parsed = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i]);
    const name = normalizeMenuItemName(cells[nameIndex]);
    const price = Number(cells[priceIndex]);
    const statusRaw = String(statusIndex >= 0 ? cells[statusIndex] : 'available').toLowerCase();
    const status = statusRaw === 'unavailable' ? 'unavailable' : 'available';

    if (!name || name.length < 2 || name.length > 70) continue;
    if (!Number.isFinite(price) || price <= 0 || price > 5000) continue;

    parsed.push({ name, price, status });
  }
  return parsed;
}

function isSmtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.OTP_FROM_EMAIL
  );
}

function getSmtpTransporter() {
  if (smtpTransporter) return smtpTransporter;
  const smtpHost = process.env.SMTP_HOST_IP || process.env.SMTP_HOST;
  smtpTransporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    family: 4,
    tls: {
      servername: process.env.SMTP_HOST
    },
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  return smtpTransporter;
}

async function sendOtpEmail(email, otp, studentName) {
  const transporter = getSmtpTransporter();
  const appName = process.env.OTP_APP_NAME || 'K-Bites';
  await transporter.sendMail({
    from: process.env.OTP_FROM_EMAIL,
    to: email,
    subject: `${appName} verification OTP`,
    text: `Hello ${studentName || 'Student'},\n\nYour OTP for ${appName} login is: ${otp}\n\nThis OTP expires in 5 minutes.\n\nIf you did not request this, please ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #222;">
        <h2>${appName} Verification</h2>
        <p>Hello ${studentName || 'Student'},</p>
        <p>Your OTP for login is:</p>
        <p style="font-size: 24px; letter-spacing: 3px; font-weight: bold;">${otp}</p>
        <p>This OTP expires in <strong>5 minutes</strong>.</p>
        <p>If you did not request this, please ignore this email.</p>
      </div>
    `
  });
}

function resolveOrderStatus(order) {
  if (!order || !order.createdAt) return order.status || 'accepted';
  if (order.status === 'ready for pickup' || order.status === 'picked up') {
    return order.status;
  }
  const elapsedMinutes = (Date.now() - new Date(order.createdAt).getTime()) / 60000;
  if (elapsedMinutes < 2) return 'accepted';
  if (elapsedMinutes < 10) return 'preparing';
  return 'ready for pickup';
}

function enrichOrder(order) {
  const totalAmount = (order.items || []).reduce((sum, item) => {
    return sum + Number(item.price || 0) * Number(item.quantity || 0);
  }, 0);
  return {
    ...order,
    status: resolveOrderStatus(order),
    totalAmount
  };
}

app.post('/api/verify-student', (req, res) => {
  const { name, email, studentId } = req.body;
  if (!name || !email || !studentId) {
    return res.status(400).json({ success: false, message: 'Please provide name, email and student ID.' });
  }

  const emailValid = /@karunya\.edu\.in$/i.test(email.toLowerCase());
  const idValid = /^URK\d{2}[A-Z]{2}\d{4}$/i.test(studentId.toUpperCase());

  if (!emailValid || !idValid) {
    return res.status(400).json({ success: false, message: 'Verification failed. Use a valid Karunya college email and student ID format.' });
  }

  res.json({ success: true, message: 'Student verified successfully.' });
});

app.post('/api/student/send-otp', async (req, res) => {
  const { name, email, studentId } = req.body;
  if (!name || !email || !studentId) {
    return res.status(400).json({ success: false, message: 'Please provide name, email, and student ID.' });
  }

  const emailLower = email.toLowerCase();
  const emailValid = /@karunya\.edu\.in$/i.test(emailLower);
  const idValid = /^URK\d{2}[A-Z]{2}\d{4}$/i.test(studentId.toUpperCase());

  if (!emailValid || !idValid) {
    return res.status(400).json({ success: false, message: 'Invalid Karunya email or student ID format.' });
  }

  const students = readData('students.json');
  let student = students.find(s => s.email === emailLower);
  if (!student) {
    student = {
      id: `STU-${Date.now()}`,
      name,
      email: emailLower,
      studentId: studentId.toUpperCase()
    };
    students.push(student);
    writeData('students.json', students);
  }

  const otps = readData('otps.json');
  const otp = generateOtp();
  otps[emailLower] = {
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000
  };
  writeData('otps.json', otps);

  if (!isSmtpConfigured()) {
    return res.status(500).json({
      success: false,
      message: 'SMTP not configured. Set up email in .env to send OTP.'
    });
  }

  try {
    await sendOtpEmail(emailLower, otp, student.name);
    res.json({ success: true, message: `OTP sent to ${emailLower}.`, student });
  } catch (error) {
    console.error('OTP email send failed:', error);
    res.status(500).json({
      success: false,
      message: `Failed to send OTP email: ${error?.message || 'Unknown SMTP error'}`
    });
  }
});

app.post('/api/student/test-email', async (req, res) => {
  const { email, name } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required to send test email.' });
  }

  if (!isSmtpConfigured()) {
    return res.status(500).json({
      success: false,
      message: 'SMTP not configured. Add SMTP settings in .env first.'
    });
  }

  try {
    const transporter = getSmtpTransporter();
    const appName = process.env.OTP_APP_NAME || 'K-Bites';
    await transporter.sendMail({
      from: process.env.OTP_FROM_EMAIL,
      to: email.toLowerCase(),
      subject: `${appName} SMTP test successful`,
      text: `Hello ${name || 'Student'}, this is a test email from ${appName}. SMTP is configured and working.`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #222;">
          <h2>${appName} Email Test</h2>
          <p>Hello ${name || 'Student'},</p>
          <p>This is a test email to confirm SMTP configuration is working correctly.</p>
          <p>You can now send real OTP emails.</p>
        </div>
      `
    });

    res.json({ success: true, message: `Test email sent to ${email.toLowerCase()}.` });
  } catch (error) {
    console.error('Test email failed:', error);
    res.status(500).json({
      success: false,
      message: `Failed to send test email: ${error?.message || 'Unknown SMTP error'}`
    });
  }
});

app.post('/api/student/verify-otp', (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ success: false, message: 'Please provide email and OTP.' });
  }

  const emailLower = email.toLowerCase();
  const otps = readData('otps.json');
  const record = otps[emailLower];

  if (!record || record.otp !== otp) {
    return res.status(400).json({ success: false, message: 'Invalid OTP. Please try again.' });
  }

  if (Date.now() > record.expiresAt) {
    delete otps[emailLower];
    writeData('otps.json', otps);
    return res.status(400).json({ success: false, message: 'OTP expired. Please request a new one.' });
  }

  delete otps[emailLower];
  writeData('otps.json', otps);

  const students = readData('students.json');
  const student = students.find(s => s.email === emailLower);
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student account not found.' });
  }

  res.json({ success: true, message: 'OTP verified successfully.', student });
});

app.get('/api/student/orders', (req, res) => {
  const { email } = req.query;
  if (!email) {
    return res.status(400).json({ success: false, message: 'Student email required.' });
  }
  const orders = readData('orders.json');
  const studentOrders = orders
    .filter(order => order.student && order.student.email === email.toLowerCase())
    .map(enrichOrder)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(studentOrders);
});

app.post('/api/order', (req, res) => {
  const { student, canteenId, items, paymentMethod, pickupSlot } = req.body;
  if (!student || !canteenId || !items || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Order must include student details, canteen, and items.' });
  }

  if (paymentMethod && paymentMethod !== 'Cash') {
    return res.status(400).json({ success: false, message: 'Only Cash payment is enabled right now.' });
  }

  const canteens = readData('canteens.json');
  const canteen = canteens.find(c => c.id === canteenId);
  if (!canteen || canteen.status === 'closed') {
    return res.status(400).json({ success: false, message: 'Selected canteen is closed for orders.' });
  }

  const menu = readData('menu.json');
  const unavailableItem = items.find(orderItem => {
    const menuItem = menu.find(menuRow => menuRow.id === orderItem.id && menuRow.canteenId === canteenId);
    return !menuItem || menuItem.status !== 'available';
  });

  if (unavailableItem) {
    return res.status(400).json({ success: false, message: 'One or more selected items are unavailable.' });
  }

  const orders = readData('orders.json');
  const newOrder = {
    id: `ORD-${Date.now()}`,
    orderToken: `TK${Math.floor(1000 + Math.random() * 9000)}`,
    student,
    canteenId,
    items,
    pickupSlot: pickupSlot || 'ASAP',
    paymentMethod: 'Cash',
    createdAt: new Date().toISOString(),
    status: 'accepted'
  };
  orders.push(newOrder);
  writeData('orders.json', orders);

  res.json({
    success: true,
    message: `Order placed successfully. Pickup token ${newOrder.orderToken}. Food will not be canceled after preparation.`,
    order: enrichOrder(newOrder)
  });
});

app.post('/api/owner-login', (req, res) => {
  const { username, password } = req.body;
  const owners = readData('owners.json');
  const owner = owners.find(o => o.username === username && o.password === password);
  if (!owner) {
    return res.status(401).json({ success: false, message: 'Invalid owner credentials.' });
  }
  res.json({ success: true, ownerId: owner.id, canteenId: owner.canteenId, name: owner.name });
});

app.post('/api/owner-register', (req, res) => {
  const { ownerName, username, password, canteenName, location } = req.body;
  if (!ownerName || !username || !password || !canteenName || !location) {
    return res.status(400).json({ success: false, message: 'Please fill all registration fields.' });
  }

  const owners = readData('owners.json');
  const usernameExists = owners.some(owner => owner.username.toLowerCase() === username.toLowerCase());
  if (usernameExists) {
    return res.status(409).json({ success: false, message: 'Username already exists. Try another username.' });
  }

  const pending = readDataOrDefault(pendingRegistrationsFile, []);
  const pendingExists = pending.some(item => item.username.toLowerCase() === username.toLowerCase() && item.status === 'pending');
  if (pendingExists) {
    return res.status(409).json({ success: false, message: 'A pending request already exists for this username.' });
  }

  const request = {
    id: createId('req'),
    ownerName: ownerName.trim(),
    username: username.trim(),
    password: password.trim(),
    canteenName: canteenName.trim(),
    location: location.trim(),
    status: 'pending',
    requestedAt: new Date().toISOString()
  };

  pending.push(request);
  writeData(pendingRegistrationsFile, pending);

  res.json({
    success: true,
    message: 'Registration request submitted. Wait for admin approval before login.',
    requestId: request.id
  });
});

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (!isAdminAuthorized(password)) {
    return res.status(401).json({ success: false, message: 'Invalid admin password.' });
  }
  res.json({ success: true, message: 'Admin login successful.' });
});

app.get('/api/admin/pending-registrations', (req, res) => {
  const { password } = req.query;
  if (!isAdminAuthorized(password)) {
    return res.status(401).json({ success: false, message: 'Unauthorized admin access.' });
  }

  const pending = readDataOrDefault(pendingRegistrationsFile, []);
  res.json(pending.filter(item => item.status === 'pending'));
});

app.post('/api/admin/approve-registration', (req, res) => {
  const { password, requestId } = req.body;
  if (!isAdminAuthorized(password)) {
    return res.status(401).json({ success: false, message: 'Unauthorized admin access.' });
  }
  if (!requestId) {
    return res.status(400).json({ success: false, message: 'Request ID is required.' });
  }

  const pending = readDataOrDefault(pendingRegistrationsFile, []);
  const requestIndex = pending.findIndex(item => item.id === requestId && item.status === 'pending');
  if (requestIndex === -1) {
    return res.status(404).json({ success: false, message: 'Pending request not found.' });
  }

  const request = pending[requestIndex];
  const owners = readData('owners.json');
  const usernameExists = owners.some(owner => owner.username.toLowerCase() === request.username.toLowerCase());
  if (usernameExists) {
    pending[requestIndex].status = 'rejected';
    pending[requestIndex].reviewedAt = new Date().toISOString();
    pending[requestIndex].adminNote = 'Username already exists.';
    writeData(pendingRegistrationsFile, pending);
    return res.status(409).json({ success: false, message: 'Username already exists. Request rejected.' });
  }

  const canteens = readData('canteens.json');
  const canteenId = createId('canteen');
  const ownerId = createId('owner');

  const newCanteen = {
    id: canteenId,
    name: request.canteenName,
    location: request.location,
    status: 'closed'
  };

  const newOwner = {
    id: ownerId,
    username: request.username,
    password: request.password,
    name: request.ownerName,
    canteenId
  };

  canteens.push(newCanteen);
  owners.push(newOwner);
  writeData('canteens.json', canteens);
  writeData('owners.json', owners);

  pending[requestIndex].status = 'approved';
  pending[requestIndex].reviewedAt = new Date().toISOString();
  pending[requestIndex].ownerId = ownerId;
  pending[requestIndex].canteenId = canteenId;
  writeData(pendingRegistrationsFile, pending);

  res.json({ success: true, message: 'Registration approved and owner account created.' });
});

app.post('/api/admin/reject-registration', (req, res) => {
  const { password, requestId, reason } = req.body;
  if (!isAdminAuthorized(password)) {
    return res.status(401).json({ success: false, message: 'Unauthorized admin access.' });
  }
  if (!requestId) {
    return res.status(400).json({ success: false, message: 'Request ID is required.' });
  }

  const pending = readDataOrDefault(pendingRegistrationsFile, []);
  const requestIndex = pending.findIndex(item => item.id === requestId && item.status === 'pending');
  if (requestIndex === -1) {
    return res.status(404).json({ success: false, message: 'Pending request not found.' });
  }

  pending[requestIndex].status = 'rejected';
  pending[requestIndex].reviewedAt = new Date().toISOString();
  pending[requestIndex].adminNote = reason ? String(reason).trim() : 'Rejected by admin';
  writeData(pendingRegistrationsFile, pending);

  res.json({ success: true, message: 'Registration request rejected.' });
});

app.get('/api/owner/orders', (req, res) => {
  const { ownerId } = req.query;
  const owners = readData('owners.json');
  const owner = owners.find(o => o.id === ownerId);
  if (!owner) {
    return res.status(401).json({ success: false, message: 'Owner not found.' });
  }
  const orders = readData('orders.json')
    .filter(order => order.canteenId === owner.canteenId)
    .map(enrichOrder)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(orders);
});

app.post('/api/owner/update-order-status', (req, res) => {
  const { ownerId, orderId, status } = req.body;
  const allowedStatuses = ['ready for pickup', 'picked up'];

  if (!ownerId || !orderId || !status) {
    return res.status(400).json({ success: false, message: 'Owner, order, and status are required.' });
  }

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid order status update.' });
  }

  const owners = readData('owners.json');
  const owner = owners.find(o => o.id === ownerId);
  if (!owner) {
    return res.status(401).json({ success: false, message: 'Owner not found.' });
  }

  const orders = readData('orders.json');
  const orderIndex = orders.findIndex(order => order.id === orderId && order.canteenId === owner.canteenId);
  if (orderIndex === -1) {
    return res.status(404).json({ success: false, message: 'Order not found for this canteen.' });
  }

  orders[orderIndex].status = status;
  if (status === 'ready for pickup') {
    orders[orderIndex].readyAt = new Date().toISOString();
  }
  if (status === 'picked up') {
    orders[orderIndex].pickedUpAt = new Date().toISOString();
  }

  writeData('orders.json', orders);
  res.json({ success: true, message: `Order ${orderId} marked as ${status}.` });
});

app.get('/api/owner/metrics', (req, res) => {
  const { ownerId } = req.query;
  const owners = readData('owners.json');
  const owner = owners.find(o => o.id === ownerId);
  if (!owner) {
    return res.status(401).json({ success: false, message: 'Owner not found.' });
  }

  const orders = readData('orders.json')
    .filter(order => order.canteenId === owner.canteenId)
    .map(enrichOrder);

  const totalRevenue = orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const readyOrders = orders.filter(order => order.status === 'ready for pickup').length;
  const preparingOrders = orders.filter(order => order.status === 'preparing').length;
  const acceptedOrders = orders.filter(order => order.status === 'accepted').length;

  res.json({
    totalOrders: orders.length,
    totalRevenue,
    readyOrders,
    preparingOrders,
    acceptedOrders
  });
});

app.post('/api/owner/update-canteen', (req, res) => {
  const { ownerId, name, location } = req.body;
  if (!ownerId || !name || !location) {
    return res.status(400).json({ success: false, message: 'Owner, canteen name, and location are required.' });
  }

  const owners = readData('owners.json');
  const owner = owners.find(o => o.id === ownerId);
  if (!owner) {
    return res.status(401).json({ success: false, message: 'Owner not found.' });
  }

  const canteens = readData('canteens.json');
  const canteenIndex = canteens.findIndex(c => c.id === owner.canteenId);
  if (canteenIndex === -1) {
    return res.status(404).json({ success: false, message: 'Canteen not found.' });
  }

  canteens[canteenIndex].name = name.trim();
  canteens[canteenIndex].location = location.trim();
  writeData('canteens.json', canteens);
  res.json({ success: true, message: 'Canteen details updated successfully.', canteen: canteens[canteenIndex] });
});

app.post('/api/owner/update-item', (req, res) => {
  const { ownerId, itemId, status } = req.body;
  const owners = readData('owners.json');
  const owner = owners.find(o => o.id === ownerId);
  if (!owner) {
    return res.status(401).json({ success: false, message: 'Owner not found.' });
  }
  const menu = readData('menu.json');
  const itemIndex = menu.findIndex(item => item.id === itemId && item.canteenId === owner.canteenId);
  if (itemIndex === -1) {
    return res.status(404).json({ success: false, message: 'Item not found.' });
  }
  menu[itemIndex].status = status;
  writeData('menu.json', menu);
  res.json({ success: true, message: 'Item status updated.' });
});

app.post('/api/owner/add-item', (req, res) => {
  const { ownerId, name, price } = req.body;
  if (!ownerId || !name || !price) {
    return res.status(400).json({ success: false, message: 'Owner, item name, and price are required.' });
  }

  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
    return res.status(400).json({ success: false, message: 'Price must be a positive number.' });
  }

  const owners = readData('owners.json');
  const owner = owners.find(o => o.id === ownerId);
  if (!owner) {
    return res.status(401).json({ success: false, message: 'Owner not found.' });
  }

  const menu = readData('menu.json');
  const newItem = {
    id: createId('item'),
    canteenId: owner.canteenId,
    name: name.trim(),
    price: numericPrice,
    status: 'available'
  };

  menu.push(newItem);
  writeData('menu.json', menu);
  res.json({ success: true, message: 'Menu item added successfully.', item: newItem });
});

app.post('/api/owner/extract-menu-from-image', upload.single('image'), async (req, res) => {
  const { ownerId } = req.body;

  if (!ownerId) {
    return res.status(400).json({ success: false, message: 'Owner ID is required.' });
  }

  const owner = getOwnerFromId(ownerId);
  if (!owner) {
    return res.status(401).json({ success: false, message: 'Owner not found.' });
  }

  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ success: false, message: 'Please upload a menu image.' });
  }

  try {
    const { data } = await Tesseract.recognize(req.file.buffer, 'eng');
    const items = parseMenuItemsFromText(data && data.text ? data.text : '');

    if (!items.length) {
      return res.status(422).json({
        success: false,
        message: 'No valid item and price pairs found. Upload a clearer image or adjust manually.'
      });
    }

    res.json({
      success: true,
      message: `Extracted ${items.length} item(s). Review and import to save.`,
      items
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to process menu image. Please try a clearer image.'
    });
  }
});

app.post('/api/owner/import-extracted-menu', (req, res) => {
  const { ownerId, items } = req.body;

  if (!ownerId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Owner and extracted items are required.' });
  }

  if (items.length > 200) {
    return res.status(400).json({ success: false, message: 'Too many items in one import. Max 200 per import.' });
  }

  const owner = getOwnerFromId(ownerId);
  if (!owner) {
    return res.status(401).json({ success: false, message: 'Owner not found.' });
  }

  const normalizedItems = items
    .map(item => {
      const name = normalizeMenuItemName(item && item.name);
      const price = Number(item && item.price);
      return { name, price };
    })
    .filter(item => item.name && item.name.length >= 2 && item.name.length <= 70 && Number.isFinite(item.price) && item.price > 0 && item.price <= 5000);

  if (!normalizedItems.length) {
    return res.status(400).json({ success: false, message: 'No valid items to import.' });
  }

  const menu = readData('menu.json');
  const existingKeys = new Set(
    menu
      .filter(item => item.canteenId === owner.canteenId)
      .map(item => `${String(item.name || '').trim().toLowerCase()}::${Number(item.price || 0)}`)
  );

  let importedCount = 0;
  normalizedItems.forEach(item => {
    const key = `${item.name.toLowerCase()}::${item.price}`;
    if (existingKeys.has(key)) return;

    menu.push({
      id: createId('item'),
      canteenId: owner.canteenId,
      name: item.name,
      price: item.price,
      status: 'available'
    });
    existingKeys.add(key);
    importedCount += 1;
  });

  writeData('menu.json', menu);
  res.json({
    success: true,
    message: `Imported ${importedCount} new item(s).`,
    importedCount,
    skippedCount: normalizedItems.length - importedCount
  });
});

app.get('/api/owner/export-menu-csv', (req, res) => {
  const { ownerId } = req.query;
  if (!ownerId) {
    return res.status(400).json({ success: false, message: 'Owner ID is required.' });
  }

  const owner = getOwnerFromId(ownerId);
  if (!owner) {
    return res.status(401).json({ success: false, message: 'Owner not found.' });
  }

  const menu = readData('menu.json').filter(item => item.canteenId === owner.canteenId);
  const csv = buildMenuCsv(menu);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="menu-${owner.canteenId}.csv"`);
  res.send(csv);
});

app.post('/api/owner/import-menu-csv', upload.single('file'), (req, res) => {
  const { ownerId } = req.body;
  if (!ownerId) {
    return res.status(400).json({ success: false, message: 'Owner ID is required.' });
  }

  const owner = getOwnerFromId(ownerId);
  if (!owner) {
    return res.status(401).json({ success: false, message: 'Owner not found.' });
  }

  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ success: false, message: 'Please upload a CSV file.' });
  }

  const csvText = req.file.buffer.toString('utf-8');
  const parsedItems = parseMenuCsv(csvText);
  if (!parsedItems.length) {
    return res.status(400).json({ success: false, message: 'No valid rows found. CSV must contain name and price columns.' });
  }

  const menu = readData('menu.json');
  const existingKeys = new Set(
    menu
      .filter(item => item.canteenId === owner.canteenId)
      .map(item => `${String(item.name || '').trim().toLowerCase()}::${Number(item.price || 0)}`)
  );

  let importedCount = 0;
  parsedItems.forEach(item => {
    const key = `${item.name.toLowerCase()}::${item.price}`;
    if (existingKeys.has(key)) return;

    menu.push({
      id: createId('item'),
      canteenId: owner.canteenId,
      name: item.name,
      price: item.price,
      status: item.status
    });
    existingKeys.add(key);
    importedCount += 1;
  });

  writeData('menu.json', menu);
  res.json({
    success: true,
    message: `Imported ${importedCount} row(s) from CSV.`,
    importedCount,
    skippedCount: parsedItems.length - importedCount
  });
});

app.post('/api/owner/delete-item', (req, res) => {
  const { ownerId, itemId } = req.body;
  if (!ownerId || !itemId) {
    return res.status(400).json({ success: false, message: 'Owner and item are required.' });
  }

  const owners = readData('owners.json');
  const owner = owners.find(o => o.id === ownerId);
  if (!owner) {
    return res.status(401).json({ success: false, message: 'Owner not found.' });
  }

  const menu = readData('menu.json');
  const itemIndex = menu.findIndex(item => item.id === itemId && item.canteenId === owner.canteenId);
  if (itemIndex === -1) {
    return res.status(404).json({ success: false, message: 'Item not found for this canteen.' });
  }

  menu.splice(itemIndex, 1);
  writeData('menu.json', menu);
  res.json({ success: true, message: 'Menu item deleted successfully.' });
});

app.post('/api/owner/update-status', (req, res) => {
  const { ownerId, status } = req.body;
  const owners = readData('owners.json');
  const owner = owners.find(o => o.id === ownerId);
  if (!owner) {
    return res.status(401).json({ success: false, message: 'Owner not found.' });
  }
  const canteens = readData('canteens.json');
  const canteenIndex = canteens.findIndex(c => c.id === owner.canteenId);
  if (canteenIndex === -1) {
    return res.status(404).json({ success: false, message: 'Canteen not found.' });
  }
  canteens[canteenIndex].status = status;
  writeData('canteens.json', canteens);
  res.json({ success: true, message: 'Canteen status updated.' });
});

app.get('/api/owner/status', (req, res) => {
  const { ownerId } = req.query;
  const owners = readData('owners.json');
  const owner = owners.find(o => o.id === ownerId);
  if (!owner) {
    return res.status(401).json({ success: false, message: 'Owner not found.' });
  }
  const canteens = readData('canteens.json');
  const canteen = canteens.find(c => c.id === owner.canteenId);
  res.json(canteen || {});
});

app.get('/api/owner/menu', (req, res) => {
  const { ownerId } = req.query;
  const owners = readData('owners.json');
  const owner = owners.find(o => o.id === ownerId);
  if (!owner) {
    return res.status(401).json({ success: false, message: 'Owner not found.' });
  }
  const menu = readData('menu.json').filter(item => item.canteenId === owner.canteenId);
  res.json(menu);
});

app.get('/api/owner/bestseller', (req, res) => {
  const { ownerId } = req.query;
  const owners = readData('owners.json');
  const owner = owners.find(o => o.id === ownerId);
  if (!owner) {
    return res.status(401).json({ success: false, message: 'Owner not found.' });
  }

  const orders = readData('orders.json').filter(order => order.canteenId === owner.canteenId);
  const tally = {};

  orders.forEach(order => {
    (order.items || []).forEach(item => {
      if (!tally[item.id]) {
        tally[item.id] = { id: item.id, name: item.name, quantity: 0 };
      }
      tally[item.id].quantity += Number(item.quantity || 0);
    });
  });

  const ranked = Object.values(tally).sort((a, b) => b.quantity - a.quantity);
  const bestSeller = ranked[0] || null;
  res.json({
    bestSeller,
    topItems: ranked.slice(0, 5),
    totalOrders: orders.length
  });
});

app.listen(port, () => {
  console.log(`Canteen preorder app running on http://localhost:${port}`);
});
