
import { sign, verify } from 'hono/jwt';

// Change this to a strong secret in production!
const JWT_SECRET = process.env.JWT_SECRET || 'komida-secret';

export interface TokenPayload {
    id: number;
    username: string;
    role: string;
    exp?: number;
}

export async function createToken(payload: Omit<TokenPayload, 'exp'>) {
    const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24; // 24 hours
    return await sign({ ...payload, exp }, JWT_SECRET);
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
    try {
        const payload = await verify(token, JWT_SECRET, 'HS256');
        return payload as unknown as TokenPayload;
    } catch (e) {
        return null;
    }
}
