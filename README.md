# StudioSpace Server

Express.js + MongoDB API for StudioSpace, a peer-to-peer creative studio booking platform.

## Features
- JWT authentication stored in HTTPOnly cookies
- Studios CRUD with owner-only update and delete
- Booking system with Pending, Confirmed, Completed and Cancelled status
- Double-booking prevention against confirmed bookings
- Seed script with demo studios and users

## Setup
1. Run `npm install`
2. Copy `.env.example` to `.env` and fill in your MongoDB URI and JWT secret
3. Run `npm run seed`
4. Run `npm run dev` (server starts on http://localhost:5000)

## Examiner login
- Email: examiner@studiospace.com
- Password: Studio123