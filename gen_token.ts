
import { createToken } from './src/utils/auth';

async function generate() {
    const token = await createToken({ id: 1, username: 'admin', role: 'admin' });
    console.log(token);
}

generate();
