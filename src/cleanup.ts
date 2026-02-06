import { Database } from "bun:sqlite";

const db = new Database("komida.db");

try {
    const result = db.run("DELETE FROM manga WHERE image = '' OR image IS NULL OR title = 'Latest Updates';");
    console.log(`Deleted ${result.changes} rows with invalid data.`);
} catch (error) {
    console.error("Error cleaning up database:", error);
}

db.close();
