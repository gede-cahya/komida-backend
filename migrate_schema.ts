
import { db } from './src/db';

console.log('Migrating database schema...');

const columns = [
    'genres TEXT',
    'synopsis TEXT',
    'status TEXT',
    'author TEXT'
];

for (const col of columns) {
    try {
        const colName = col.split(' ')[0];
        console.log(`Adding column ${colName}...`);
        db.run(`ALTER TABLE manga ADD COLUMN ${col}`);
        console.log(`Added ${colName}.`);
    } catch (e: any) {
        if (e.message.includes('duplicate column')) {
            console.log(`Column already exists.`); // SQLite error message varies
        } else {
            console.log(`Error adding column: ${e.message}`);
        }
    }
}

console.log('Migration complete.');
