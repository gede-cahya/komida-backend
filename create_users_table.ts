
import { db } from './src/db';

console.log('Migrating database: Creating users table...');

try {
    db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
    console.log('Users table created successfully.');
} catch (e: any) {
    console.error('Error creating users table:', e);
}
