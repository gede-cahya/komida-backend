
import { db } from './src/db';

console.log('Migrating database: Creating comments table...');

try {
    db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      slug TEXT NOT NULL,
      chapter_slug TEXT,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
    console.log('Comments table created successfully.');
} catch (e: any) {
    console.error('Error creating comments table:', e);
}
