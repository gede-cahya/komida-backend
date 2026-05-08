async function findImages(obj: any, path = ""): Promise<void> {
    if (typeof obj === 'string') {
        if (obj.includes('cdn1.softkomik') || obj.includes('.webp') || obj.includes('.jpg')) {
            console.log(`Found string match at ${path}: ${obj.substring(0, 100)}`);
        }
    } else if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            findImages(obj[i], `${path}[${i}]`);
        }
    } else if (obj !== null && typeof obj === 'object') {
        for (const key of Object.keys(obj)) {
            findImages(obj[key], `${path}.${key}`);
        }
    }
}

async function test() {
    const url = "https://softkomik.co/_next/data/KJDpNsdpNtzEq6Q1gWBOi/i-became-a-munchkin-skill-thief-bahasa-indonesia/chapter/029.json";
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
    const json = await res.json();
    console.log("Searching for image urls in JSON:");
    findImages(json, "root");
}
test();
