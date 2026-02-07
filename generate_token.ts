
import { createToken } from './src/utils/auth';
import { db } from './src/db';

async function generate() {
    const admin = db.query("SELECT id, username, role FROM users WHERE role = 'admin'").get() as any;
    if (!admin) {
        console.error('No admin user found!');
        return;
    }
    const token = await createToken({ id: admin.id, username: admin.username, role: admin.role });
    console.log(token);
}

generate();
