
import { fetch } from 'bun';

async function checkKacu() {
    const url = 'http://kacu.gmbr.pro/uploads/manga-images/t/the-nebulas-civilization/thumbnail.jpg';
    console.log(`Testing access to ${url}`);

    try {
        const res = await fetch(url, {
            headers: {
                'Referer': 'https://www.manhwaindo.my/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        console.log(`Status: ${res.status}`);
        console.log(`Content-Type: ${res.headers.get('content-type')}`);
        if (res.ok) console.log('Success!');
        else console.log('Failed.');
    } catch (e: any) {
        console.log(`Error: ${e.message}`);
    }
}
checkKacu();
