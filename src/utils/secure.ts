
const KEY = 'komida-v1';

// XOR Cipher
function xorString(text: string): string {
    let result = '';
    for (let i = 0; i < text.length; i++) {
        result += String.fromCharCode(text.charCodeAt(i) ^ KEY.charCodeAt(i % KEY.length));
    }
    return result;
}

export function encryptData(data: any): string {
    try {
        const json = JSON.stringify(data);
        const xor = xorString(json);
        return Buffer.from(xor, 'binary').toString('base64url');
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
        const xor = Buffer.from(enc, 'base64url').toString('binary');
        const json = xorString(xor);
        return JSON.parse(json);
    } catch (e) {
        console.error('Decryption failed for:', enc);
        return null;
    }
}
