
const KEY = 'komida-v1';

export function encryptData(data: any): string {
    try {
        const json = JSON.stringify(data);
        const buffer = Buffer.from(json, 'utf8');
        const keyBuffer = Buffer.from(KEY, 'utf8');

        const output = Buffer.alloc(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
            output[i] = buffer[i] ^ keyBuffer[i % keyBuffer.length];
        }

        return output.toString('base64url');
    } catch (e) {
        console.error('Encryption failed', e);
        return '';
    }
}

export function decryptData(enc: string): any {
    if (!enc) return null;

    // Fallback: If it's a legacy URL (starts with http), return it wrapped
    if (enc.startsWith('http') || enc.startsWith('/')) {
        return { link: enc, source: '' }; // Partial data for legacy support
    }

    try {
        const buffer = Buffer.from(enc, 'base64url');
        const keyBuffer = Buffer.from(KEY, 'utf8');

        const output = Buffer.alloc(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
            output[i] = buffer[i] ^ keyBuffer[i % keyBuffer.length];
        }

        const json = output.toString('utf8');
        return JSON.parse(json);
    } catch (e) {
        // console.error('Decryption failed for:', enc); // Squelch noise for invalid IDs
        return null;
    }
}
