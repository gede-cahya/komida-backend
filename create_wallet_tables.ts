import { db } from './src/db';

async function createMissingTables() {
  try {
    console.log('Creating missing tables for wallet/shop features...');

    // Create user_credits table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_credits (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE,
        balance INTEGER NOT NULL DEFAULT 0,
        base_chain_balance VARCHAR(50) DEFAULT '0',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✓ user_credits table created/verified');

    // Create transactions table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        transaction_type VARCHAR(50) NOT NULL,
        amount INTEGER NOT NULL,
        currency VARCHAR(10) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        payment_method VARCHAR(20) NOT NULL,
        tx_hash TEXT,
        qris_transaction_id TEXT,
        item_purchased_id INTEGER,
        item_name TEXT,
        credit_amount INTEGER,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✓ transactions table created/verified');

    // Create user_decorations table if not exists
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_decorations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        decoration_id INTEGER NOT NULL,
        is_equipped BOOLEAN DEFAULT false,
        acquired_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, decoration_id)
      )
    `);
    console.log('✓ user_decorations table created/verified');

    // Create user_badges table if not exists
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_badges (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        badge_id INTEGER NOT NULL,
        is_equipped BOOLEAN DEFAULT true,
        acquired_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, badge_id)
      )
    `);
    console.log('✓ user_badges table created/verified');

    console.log('\n✅ All missing tables created successfully!');
  } catch (error: any) {
    console.error('❌ Error creating tables:', error.message);
    process.exit(1);
  }
}

import { sql } from 'drizzle-orm';
createMissingTables();
