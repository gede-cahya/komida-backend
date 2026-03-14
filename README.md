# ⚙️ Komida Backend

The powerhouse behind Komida, providing high-performance manga scraping, user management, and blockchain payment processing. Built with Bun, Hono, and Drizzle ORM.

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh/)
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

## 🛠️ Tech Stack

- **Runtime**: [Bun](https://bun.sh/)
- **Framework**: [Hono](https://hono.dev/)
- **ORM**: [Drizzle ORM](https://orm.drizzle.team/)
- **Validation**: [Zod](https://zod.dev/)
- **Blockchain**: [Viem](https://viem.sh/)

## 📡 API Endpoints

- `GET /api` - Root health check
- `GET /api/popular` - Get popular manga
- `GET /api/latest` - Get latest updates
- `GET /api/genres` - List available genres
- `GET /api/manga/:slug` - Get manga details
- `GET /api/manga/:slug/:chapter` - Get chapter images

