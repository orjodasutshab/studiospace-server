import { MongoClient } from 'mongodb';

let dbPromise;

// Connects once and reuses the same connection for every request.
export function getDb() {
  if (!dbPromise) {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is missing. Add it to your .env file.');
    }
    const client = new MongoClient(process.env.MONGODB_URI);
    dbPromise = client
      .connect()
      .then(() => client.db(process.env.DB_NAME || 'studiospace'))
      .catch((err) => {
        dbPromise = undefined; // allow a retry on the next request
        throw err;
      });
  }
  return dbPromise;
}
