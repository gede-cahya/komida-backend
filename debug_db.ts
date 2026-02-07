
import { Database } from 'bun:sqlite';

const db = new Database('/home/cahya/2026/komida-backend/komida.db');

console.log('Checking ManhwaIndo items...');
const results = db.query("SELECT id, title, image, source FROM manga WHERE source LIKE '%Manhwa%' LIMIT 5").all();
console.log(JSON.stringify(results, null, 2));
