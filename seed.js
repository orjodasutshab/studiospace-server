import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { getDb } from './db.js';

const host = { name: 'Nadia Rahman', email: 'host@studiospace.com' };

const studios = [
  { title: 'Northlight Cyc Wall Studio', category: 'Photo Studio', hourlyRate: 45, securityDeposit: 100, capacity: 10, location: 'Gulshan, Dhaka', rating: 4.9, reviewCount: 38, amenities: ['Cyc wall', 'Strobe lights', 'Backdrops', 'Makeup station', 'Free WiFi'], overview: 'A 900 sq ft white cyc wall studio with big north-facing windows. Perfect for product shoots, fashion lookbooks and portraits. Two strobe kits and six paper backdrops are included in the hourly rate.' },
  { title: 'Midnight Sound Stage', category: 'Film Stage', hourlyRate: 120, securityDeposit: 300, capacity: 30, location: 'Banani, Dhaka', rating: 4.8, reviewCount: 21, amenities: ['Green screen', 'Lighting grid', 'Dressing room', 'Power backup', 'Parking'], overview: 'A fully soundproofed 2,500 sq ft stage with a lighting grid, drive-in loading door and a green screen corner. Built for short films, music videos and commercials.' },
  { title: 'The Quiet Mic Podcast Lounge', category: 'Podcast Lounge', hourlyRate: 25, securityDeposit: 50, capacity: 4, location: 'Dhanmondi, Dhaka', rating: 4.7, reviewCount: 64, amenities: ['4 mics', 'Audio interface', 'Acoustic panels', 'Couch seating', 'Tea and coffee'], overview: 'A cosy treated room with four broadcast microphones, headphones for every guest and a mixer. Record audio or video podcasts in comfort.' },
  { title: 'Echo Room Recording Suite', category: 'Music Suite', hourlyRate: 60, securityDeposit: 150, capacity: 8, location: 'Uttara, Dhaka', rating: 4.9, reviewCount: 45, amenities: ['Vocal booth', 'Studio monitors', 'Drum kit', 'Piano', 'Engineer on request'], overview: 'A two-room recording suite with an isolated vocal booth, a live room and a control room with studio monitors. Bring your band or record vocals.' },
  { title: 'Clay and Canvas Art Workshop', category: 'Workshop', hourlyRate: 30, securityDeposit: 60, capacity: 14, location: 'Mirpur, Dhaka', rating: 4.6, reviewCount: 17, amenities: ['Easels', 'Pottery wheel', 'Sink', 'Natural light', 'Storage racks'], overview: 'A bright open workshop with easels, a pottery wheel and plenty of table space. Ideal for classes, painting sessions and craft events.' },
  { title: 'Golden Hour Loft', category: 'Photo Studio', hourlyRate: 55, securityDeposit: 120, capacity: 12, location: 'Baridhara, Dhaka', rating: 4.8, reviewCount: 29, amenities: ['Natural light', 'Props', 'Rooftop access', 'Changing room', 'Free WiFi'], overview: 'A warm brick-walled loft with floor-to-ceiling windows and a small rooftop terrace. Great for lifestyle, wedding and portrait photography.' },
  { title: 'Reel Works Mini Stage', category: 'Film Stage', hourlyRate: 80, securityDeposit: 200, capacity: 20, location: 'Bashundhara, Dhaka', rating: 4.5, reviewCount: 12, amenities: ['Black box', 'Dolly track', 'Monitor wall', 'Power backup'], overview: 'A compact black-box stage with dolly track, monitoring wall and quiet air conditioning. A great pick for interviews, scenes and ad films.' },
  { title: 'Beatbox Producer Suite', category: 'Music Suite', hourlyRate: 35, securityDeposit: 80, capacity: 5, location: 'Mohammadpur, Dhaka', rating: 4.4, reviewCount: 23, amenities: ['MIDI keyboard', 'Monitors', 'Sound treatment', 'Free WiFi'], overview: 'A producer-friendly room with MIDI keys, monitors and a comfortable desk setup. Beat making, mixing and songwriting sessions are welcome.' },
];

const db = await getDb();

// Demo accounts for the examiner.
await db.collection('users').deleteMany({ email: { $in: [host.email, 'examiner@studiospace.com'] } });
await db.collection('users').insertMany([
  { ...host, photoUrl: 'https://i.pravatar.cc/150?img=47', passwordHash: await bcrypt.hash('Host123', 10), createdAt: new Date() },
  { name: 'Demo Examiner', email: 'examiner@studiospace.com', photoUrl: 'https://i.pravatar.cc/150?img=12', passwordHash: await bcrypt.hash('Studio123', 10), createdAt: new Date() },
]);

// Reset the demo host's studios.
await db.collection('studios').deleteMany({ ownerEmail: host.email });
await db.collection('studios').insertMany(
  studios.map((s, i) => ({
    ...s,
    imageUrl: `https://picsum.photos/seed/studiospace${i + 1}/900/600`,
    ownerEmail: host.email,
    ownerName: host.name,
    ownerPhoto: 'https://i.pravatar.cc/150?img=47',
    createdAt: new Date(Date.now() - i * 86400000),
  }))
);

console.log('Seed complete: 8 studios, 2 demo users.');
console.log('Examiner login -> examiner@studiospace.com / Studio123');
process.exit(0);
