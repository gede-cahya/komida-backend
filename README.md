# ⚙️ Komida Backend

The powerhouse behind Komida, providing high-performance manga scraping, user management, and blockchain payment processing. Built with Bun, Hono, and Drizzle ORM.

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh/)
- [Go](https://go.dev/) 1.24+
- [PostgreSQL](https://www.postgresql.org/) (or Supabase instance)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/gede-cahya/komida-backend.git
   cd komida-backend
   ```

2. **Install dependencies**:
   ```bash
   bun install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory:
   ```env
   DATABASE_URL=your_postgresql_url
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_key
   PORT=3481
   BASE_RPC_URL=https://mainnet.base.org
   PAYMENT_WALLET_ADDRESS=your_wallet_address
   ```

4. **Run Database Migrations**:
   ```bash
   bun run migrate_schema.ts
   ```

5. **Run the development server**:
   ```bash
   bun run dev
   ```

6. **Run the Go image proxy sidecar**:
   ```bash
   bun run imageproxy:dev
   ```

## 🛠️ Tech Stack

- **Runtime**: [Bun](https://bun.sh/)
- **Framework**: [Hono](https://hono.dev/)
- **ORM**: [Drizzle ORM](https://orm.drizzle.team/)
- **Validation**: [Zod](https://zod.dev/)
- **Blockchain**: [Viem](https://viem.sh/)
- **Image proxy sidecar**: Go standard library HTTP server

## 📡 API Endpoints

- `GET /api` - Root health check
- `GET /api/popular` - Get popular manga
- `GET /api/latest` - Get latest updates
- `GET /api/genres` - List available genres
- `GET /api/manga/:slug` - Get manga details
- `GET /api/manga/:slug/:chapter` - Get chapter images
- `GET /api/image/proxy?url=...` - Proxy and cache chapter images

## Go Image Proxy Sidecar

The Go sidecar is the first migration milestone. It keeps the existing Bun backend in place while allowing `/api/image/proxy` and selected read-only manga routes to be routed to a dedicated service on port `3482`.

It provides:

- `X-Cache: HIT`, `MISS`, `STALE`, `BUSY`, or `BYPASS`
- disk cache keyed by SHA-256 URL hash
- stale cached image fallback when upstream fails
- source-specific `Referer` mapping for Kiryuu, ManhwaIndo, and Softkomik
- SSRF protection for private, loopback, link-local, multicast, and localhost targets

Read-only manga routes enabled when `DATABASE_URL` is set:

- `GET /api/trending`
- `GET /api/recent`
- `GET /api/popular?page=1`
- `GET /api/genres`
- `GET /api/genres/{genre}?page=1`
- `GET /api/manga/search?q=...`
- `GET /api/manga/slug/{slug}`

Scraper-backed routes (Kiryuu, ManhwaIndo, Softkomik, Keikomik providers, always enabled):

- `GET /api/manga/detail?source=Kiryuu|ManhwaIndo|Softkomik|Keikomik&link=...`
- `GET /api/manga/chapter?source=Kiryuu|ManhwaIndo|Softkomik|Keikomik&link=...`
- `GET /api/manga/external-search?q=...`

Auth/User/Comment routes enabled when `DATABASE_URL` is set:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/nonce`
- `POST /api/auth/verify-wallet`
- `GET /api/user/me`
- `PUT /api/user/profile`
- `GET /api/user/decorations`
- `GET /api/user/badges`
- `GET /api/user/tier`
- `GET /api/user/credits`
- `GET /api/user/inventory`
- `GET /api/user/transactions`
- `GET /api/comments/{slug}?chapter=...`
- `POST /api/comments?slug=...`
- `PUT /api/comments/{id}`
- `DELETE /api/comments/{id}`

Analytics routes enabled when `DATABASE_URL` is set:

- `POST /api/analytics/track/view?slug=...`
- `POST /api/analytics/track/visit`
- `GET /api/analytics/top-manga?period=day|week|month`
- `GET /api/analytics/site-visits?period=day|week|month`
- `GET /api/analytics/summary`

Admin routes enabled when `DATABASE_URL` is set (requires admin role):

- `GET /api/admin/users?page=1&limit=20&search=...`
- `GET /api/admin/manga?page=1&limit=20&search=...&source=...`
- `GET /api/admin/manga/{id}`
- `GET /api/admin/comments?page=1&limit=20`
- `GET /api/admin/active-users`
- `GET /api/admin/announcements`
- `GET /api/admin/announcements/{id}`
- `GET /api/announcements/active`
- `GET /api/admin/bug-reports?page=1&limit=20&status=...`
- `GET /api/admin/bug-reports/{id}`
- `POST /api/bug-reports`
- `GET /api/admin/system/health`
- `GET /api/admin/quests`
- `POST /api/admin/quests`
- `PUT /api/admin/quests/{id}`
- `DELETE /api/admin/quests/{id}`
- `POST /api/admin/manga/update-all`
- `POST /api/admin/manga/fix-images`
- `PUT /api/admin/manga/{id}`

Quest routes enabled when `DATABASE_URL` is set:

- `GET /api/quests`
- `GET /api/user/quests`
- `POST /api/user/quests/{id}/claim`

Shop routes (always enabled):

- `GET /api/shop/items`
- `GET /api/shop/credit-packs`
- `GET /api/shop/decorations`
- `POST /api/shop/purchase`

Web3 routes enabled when `DATABASE_URL` is set:

- `GET /api/auth/nonce`
- `POST /api/auth/verify-wallet`

Upload routes (always enabled):

- `POST /api/upload`
- `GET /api/uploads/{filename}`

Payment routes enabled when `DATABASE_URL` is set:

- `POST /api/payment/qris`
- `POST /api/payment/crypto`
- `GET /api/payment/verify?transaction_id=...`
- `GET /api/payment/wallet-balance`

All major read and write routes are now implemented in Go.

Manual `.env` values:

```env
IMAGE_PROXY_ADDR=:3482
IMAGE_PROXY_CACHE_DIR=./cache/images-go
IMAGE_PROXY_CACHE_TTL=168h
IMAGE_PROXY_CACHE_MAX_BYTES=3221225472
IMAGE_PROXY_FETCH_TIMEOUT=3s
IMAGE_PROXY_MAX_CONCURRENCY=30
IMAGE_PROXY_MAX_IMAGE_BYTES=26214400
IMAGE_PROXY_ALLOW_PRIVATE_IPS=false
IMAGE_PROXY_CLEANUP_INTERVAL=6h
```

