import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { getDb } from './db.js';
import { COOKIE_NAME, cookieOptions, signToken, requireAuth } from './middleware/auth.js';

const app = express();

// ---------------------------------------------------------------- setup
const allowedOrigins = [process.env.CLIENT_URL, 'http://localhost:3000']
  .filter(Boolean)
  .flatMap((s) => s.split(','))
  .map((s) => s.trim().replace(/\/$/, ''));

app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
    credentials: true, // lets the browser send the login cookie
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// Lets us use async/await in routes without try/catch everywhere.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------------------------------------------------------------- helpers
const CATEGORIES = ['Photo Studio', 'Film Stage', 'Podcast Lounge', 'Music Suite', 'Workshop'];
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const validPassword = (p) => /[A-Z]/.test(p) && /[a-z]/.test(p) && p.length >= 6;
const withId = (doc) => (doc ? { ...doc, _id: String(doc._id) } : doc);

// "14:30" -> 870 (minutes from midnight). Returns null if the text is not a valid time.
function toMinutes(time) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(time));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function parseStudioBody(body) {
  const title = String(body.title || '').trim();
  const location = String(body.location || '').trim();
  const imageUrl = String(body.imageUrl || '').trim();
  const overview = String(body.overview || '').trim();
  const category = body.category;
  const hourlyRate = Number(body.hourlyRate);
  const securityDeposit = Number(body.securityDeposit);
  const capacity = Number(body.capacity);
  const amenities = Array.isArray(body.amenities) ? body.amenities.map(String) : [];

  if (!title || !location || !imageUrl || !overview) {
    return { error: 'Title, location, image and overview are required' };
  }
  if (!CATEGORIES.includes(category)) return { error: 'Please choose a valid category' };
  if (!(hourlyRate > 0)) return { error: 'Hourly rate must be more than 0' };
  if (!(securityDeposit >= 0)) return { error: 'Security deposit cannot be negative' };
  if (!(capacity >= 1)) return { error: 'Capacity must be at least 1 person' };

  return {
    data: { title, category, hourlyRate, securityDeposit, capacity, location, imageUrl, amenities, overview },
  };
}

// True when another CONFIRMED booking already uses part of this time on this day.
async function hasConfirmedOverlap(db, { studioId, date, startMin, endMin, excludeId }) {
  const filter = {
    studioId,
    date,
    status: 'Confirmed',
    startMin: { $lt: endMin }, // existing starts before the new one ends
    endMin: { $gt: startMin }, // existing ends after the new one starts
  };
  if (excludeId) filter._id = { $ne: excludeId };
  return Boolean(await db.collection('bookings').findOne(filter));
}

// ---------------------------------------------------------------- basic
app.get('/', (_req, res) => res.send('StudioSpace server is running'));
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// ---------------------------------------------------------------- auth
app.post(
  '/api/auth/register',
  wrap(async (req, res) => {
    const { name, email, photoUrl, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    if (!validPassword(String(password))) {
      return res.status(400).json({
        error: 'Password needs an uppercase letter, a lowercase letter and at least 6 characters',
      });
    }
    const db = await getDb();
    const cleanEmail = String(email).trim().toLowerCase();
    if (await db.collection('users').findOne({ email: cleanEmail })) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    await db.collection('users').insertOne({
      name: String(name).trim(),
      email: cleanEmail,
      photoUrl: String(photoUrl || '').trim(),
      passwordHash: await bcrypt.hash(String(password), 10),
      createdAt: new Date(),
    });
    res.status(201).json({ message: 'Account created. Please log in.' });
  })
);

app.post(
  '/api/auth/login',
  wrap(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const db = await getDb();
    const user = await db.collection('users').findOne({ email: String(email).trim().toLowerCase() });
    const ok = user?.passwordHash && (await bcrypt.compare(String(password), user.passwordHash));
    if (!ok) return res.status(401).json({ error: 'Wrong email or password' });

    res.cookie(COOKIE_NAME, signToken(user), cookieOptions());
    res.json({ user: { id: String(user._id), name: user.name, email: user.email, photoUrl: user.photoUrl } });
  })
);

// The client calls this on every page reload to learn who is logged in.
app.get('/api/auth/me', requireAuth, (req, res) => {
  const { id, name, email, photoUrl } = req.user;
  res.json({ user: { id, name, email, photoUrl } });
});

app.post('/api/auth/logout', (_req, res) => {
  const { maxAge, ...options } = cookieOptions();
  res.clearCookie(COOKIE_NAME, options);
  res.json({ message: 'Logged out' });
});

// ---------------------------------------------------------------- studios
// Public. Supports ?q= ?category= ?minPrice= ?maxPrice= ?sort= ?limit=
app.get(
  '/api/studios',
  wrap(async (req, res) => {
    const { q, category, minPrice, maxPrice, sort, limit } = req.query;
    const filter = {};
    if (category) filter.category = String(category);
    if (q) {
      const rx = { $regex: escapeRegex(String(q)), $options: 'i' };
      filter.$or = [{ title: rx }, { location: rx }];
    }
    if (minPrice || maxPrice) {
      filter.hourlyRate = {};
      if (minPrice) filter.hourlyRate.$gte = Number(minPrice);
      if (maxPrice) filter.hourlyRate.$lte = Number(maxPrice);
    }
    const sorts = {
      'price-asc': { hourlyRate: 1 },
      'price-desc': { hourlyRate: -1 },
      rating: { rating: -1, createdAt: -1 },
      newest: { createdAt: -1 },
    };
    const db = await getDb();
    let cursor = db.collection('studios').find(filter).sort(sorts[sort] || sorts.newest);
    const max = parseInt(String(limit), 10);
    if (max > 0) cursor = cursor.limit(max);
    res.json((await cursor.toArray()).map(withId));
  })
);

app.get(
  '/api/studios/:id',
  wrap(async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'Studio not found' });
    const db = await getDb();
    const studio = await db.collection('studios').findOne({ _id: new ObjectId(req.params.id) });
    if (!studio) return res.status(404).json({ error: 'Studio not found' });
    res.json(withId(studio));
  })
);

app.post(
  '/api/studios',
  requireAuth,
  wrap(async (req, res) => {
    const { data, error } = parseStudioBody(req.body);
    if (error) return res.status(400).json({ error });
    const db = await getDb();
    const studio = {
      ...data,
      rating: 0,
      reviewCount: 0,
      ownerEmail: req.user.email, // taken from the login cookie, not from the form
      ownerName: req.user.name,
      ownerPhoto: req.user.photoUrl,
      createdAt: new Date(),
    };
    const result = await db.collection('studios').insertOne(studio);
    res.status(201).json(withId({ ...studio, _id: result.insertedId }));
  })
);

app.get(
  '/api/my-listings',
  requireAuth,
  wrap(async (req, res) => {
    const db = await getDb();
    const list = await db.collection('studios').find({ ownerEmail: req.user.email }).sort({ createdAt: -1 }).toArray();
    res.json(list.map(withId));
  })
);

// Finds a studio and makes sure the logged-in user owns it.
async function loadOwnStudio(req, res) {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(404).json({ error: 'Studio not found' });
    return null;
  }
  const db = await getDb();
  const studio = await db.collection('studios').findOne({ _id: new ObjectId(req.params.id) });
  if (!studio) {
    res.status(404).json({ error: 'Studio not found' });
    return null;
  }
  if (studio.ownerEmail !== req.user.email) {
    res.status(403).json({ error: 'You can only change your own studios' });
    return null;
  }
  return studio;
}

app.put(
  '/api/studios/:id',
  requireAuth,
  wrap(async (req, res) => {
    const studio = await loadOwnStudio(req, res);
    if (!studio) return;
    const { data, error } = parseStudioBody(req.body);
    if (error) return res.status(400).json({ error });
    const db = await getDb();
    await db.collection('studios').updateOne({ _id: studio._id }, { $set: { ...data, updatedAt: new Date() } });
    res.json({ message: 'Studio updated' });
  })
);

app.delete(
  '/api/studios/:id',
  requireAuth,
  wrap(async (req, res) => {
    const studio = await loadOwnStudio(req, res);
    if (!studio) return;
    const db = await getDb();
    await db.collection('studios').deleteOne({ _id: studio._id });
    res.json({ message: 'Studio deleted' });
  })
);

// ---------------------------------------------------------------- bookings
app.post(
  '/api/bookings',
  requireAuth,
  wrap(async (req, res) => {
    const { studioId, date, startTime, endTime, note } = req.body;
    const startMin = toMinutes(startTime);
    const endMin = toMinutes(endTime);

    if (!studioId || !ObjectId.isValid(studioId)) return res.status(400).json({ error: 'Studio is required' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return res.status(400).json({ error: 'Please choose a valid date' });
    if (startMin === null || endMin === null) return res.status(400).json({ error: 'Please choose valid start and end times' });
    if (endMin <= startMin) return res.status(400).json({ error: 'End time must be after the start time' });
    if (date < new Date().toISOString().slice(0, 10)) return res.status(400).json({ error: 'You cannot book a past date' });

    const db = await getDb();
    const studio = await db.collection('studios').findOne({ _id: new ObjectId(studioId) });
    if (!studio) return res.status(404).json({ error: 'Studio not found' });
    if (studio.ownerEmail === req.user.email) {
      return res.status(400).json({ error: 'You cannot book your own studio' });
    }

    // Challenge: stop double booking.
    if (await hasConfirmedOverlap(db, { studioId: String(studio._id), date, startMin, endMin })) {
      return res.status(409).json({
        error: 'This time slot is already booked. Please choose a different time or date.',
      });
    }

    const hours = (endMin - startMin) / 60;
    const subtotal = Math.round(studio.hourlyRate * hours * 100) / 100;
    const booking = {
      studioId: String(studio._id),
      studioTitle: studio.title,
      studioImage: studio.imageUrl,
      studioLocation: studio.location,
      ownerEmail: studio.ownerEmail,
      userEmail: req.user.email,
      userName: req.user.name,
      date,
      startTime,
      endTime,
      startMin,
      endMin,
      hours,
      hourlyRate: studio.hourlyRate,
      securityDeposit: studio.securityDeposit,
      totalCost: subtotal + studio.securityDeposit,
      note: String(note || '').slice(0, 500),
      status: 'Pending',
      createdAt: new Date(),
    };
    const result = await db.collection('bookings').insertOne(booking);
    res.status(201).json(withId({ ...booking, _id: result.insertedId }));
  })
);

// Bookings I made as a creator.
app.get(
  '/api/my-bookings',
  requireAuth,
  wrap(async (req, res) => {
    const db = await getDb();
    const list = await db.collection('bookings').find({ userEmail: req.user.email }).sort({ createdAt: -1 }).toArray();
    res.json(list.map(withId));
  })
);

// Bookings other people made for MY studios (host view).
app.get(
  '/api/host-bookings',
  requireAuth,
  wrap(async (req, res) => {
    const db = await getDb();
    const list = await db.collection('bookings').find({ ownerEmail: req.user.email }).sort({ createdAt: -1 }).toArray();
    res.json(list.map(withId));
  })
);

// Creator cancels their own Pending booking.
app.patch(
  '/api/bookings/:id/cancel',
  requireAuth,
  wrap(async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'Booking not found' });
    const db = await getDb();
    const booking = await db.collection('bookings').findOne({ _id: new ObjectId(req.params.id), userEmail: req.user.email });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.status !== 'Pending') {
      return res.status(400).json({ error: 'Only pending bookings can be cancelled' });
    }
    await db.collection('bookings').updateOne({ _id: booking._id }, { $set: { status: 'Cancelled' } });
    res.json({ message: 'Booking cancelled' });
  })
);

// Host confirms / completes / cancels a booking for their own studio.
app.patch(
  '/api/bookings/:id/status',
  requireAuth,
  wrap(async (req, res) => {
    const { status } = req.body;
    if (!['Confirmed', 'Completed', 'Cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'Booking not found' });
    const db = await getDb();
    const booking = await db.collection('bookings').findOne({ _id: new ObjectId(req.params.id), ownerEmail: req.user.email });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (status === 'Confirmed') {
      const clash = await hasConfirmedOverlap(db, {
        studioId: booking.studioId,
        date: booking.date,
        startMin: booking.startMin,
        endMin: booking.endMin,
        excludeId: booking._id,
      });
      if (clash) {
        return res.status(409).json({ error: 'Another confirmed booking already uses this time slot' });
      }
    }
    await db.collection('bookings').updateOne({ _id: booking._id }, { $set: { status } });
    res.json({ message: `Booking marked as ${status}` });
  })
);

// ---------------------------------------------------------------- errors
app.use('/api', (_req, res) => res.status(404).json({ error: 'Route not found' }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

const PORT = process.env.PORT || 5000;
if (!process.env.VERCEL) {
  app.listen(PORT, () => console.log(`StudioSpace server running on http://localhost:${PORT}`));
}

export default app;
