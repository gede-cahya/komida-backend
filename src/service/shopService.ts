import { db } from '../db';
import { 
  decorations, 
  badges, 
  userDecorations, 
  userBadges, 
  userCredits, 
  transactions,
} from '../db/schema';
import { eq, and } from 'drizzle-orm';

// Shop item definitions (should match frontend)
export interface ShopItem {
  id: number;
  item_type: 'decoration' | 'badge' | 'credit_pack';
  item_id: number;
  name: string;
  description: string;
  price_credits: number;
  price_qris: number;
  price_crypto: string; // wei
  is_available: boolean;
  image_url: string;
  created_at: string;
}

// Default shop items (sync with frontend)
export const DEFAULT_SHOP_ITEMS: ShopItem[] = [
  // Decorations
  {
    id: 1,
    item_type: 'decoration',
    item_id: 1,
    name: 'Pop Art Action',
    description: 'Stand out with vibrant pop art style borders and action text!',
    price_credits: 200,
    price_qris: 30000,
    price_crypto: '200000000000000',
    is_available: true,
    image_url: 'css:pop-art',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    item_type: 'decoration',
    item_id: 2,
    name: 'Manga Speed Lines',
    description: 'Dynamic speed lines background for that manga protagonist feel.',
    price_credits: 250,
    price_qris: 35000,
    price_crypto: '250000000000000',
    is_available: true,
    image_url: 'css:manga-speed',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 3,
    item_type: 'decoration',
    item_id: 3,
    name: 'Cyberpunk Mecha',
    description: 'Futuristic HUD elements with neon glow effects.',
    price_credits: 300,
    price_qris: 45000,
    price_crypto: '300000000000000',
    is_available: true,
    image_url: 'css:cyberpunk',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 4,
    item_type: 'decoration',
    item_id: 4,
    name: 'Webtoon Panels',
    description: 'Colorful webtoon-style panel backgrounds.',
    price_credits: 250,
    price_qris: 35000,
    price_crypto: '250000000000000',
    is_available: true,
    image_url: 'css:webtoon',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 5,
    item_type: 'decoration',
    item_id: 5,
    name: 'Halftone Noir',
    description: 'Classic comic book halftone pattern with noir aesthetics.',
    price_credits: 200,
    price_qris: 30000,
    price_crypto: '200000000000000',
    is_available: true,
    image_url: 'css:halftone',
    created_at: '2026-01-01T00:00:00Z',
  },
  // Credit Packs
  {
    id: 101,
    item_type: 'credit_pack',
    item_id: 1,
    name: 'Starter Pack',
    description: '100 Credits - Perfect for first-time buyers',
    price_credits: 0,
    price_qris: 15000,
    price_crypto: '100000000000000',
    is_available: true,
    image_url: '/shop/credit-pack.svg',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 102,
    item_type: 'credit_pack',
    item_id: 2,
    name: 'Gamer Pack',
    description: '550 Credits (500 + 50 Bonus) - Best Value!',
    price_credits: 0,
    price_qris: 70000,
    price_crypto: '500000000000000',
    is_available: true,
    image_url: '/shop/credit-pack.svg',
    created_at: '2026-01-01T00:00:00Z',
  },
];

export class ShopService {
  /**
   * Get all shop items
   */
  async getShopItems() {
    return DEFAULT_SHOP_ITEMS.filter(item => item.is_available);
  }

  /**
   * Get shop item by ID
   */
  getShopItem(itemId: number): ShopItem | undefined {
    return DEFAULT_SHOP_ITEMS.find(item => item.id === itemId);
  }

  /**
   * Purchase item with credits
   */
  async purchaseItemWithCredits(userId: number, itemId: number) {
    const item = this.getShopItem(itemId);
    
    if (!item) {
      throw new Error('Item not found');
    }

    if (!item.is_available) {
      throw new Error('Item is not available');
    }

    // Get user credits
    const credits = await db.select()
      .from(userCredits)
      .where(eq(userCredits.userId, userId))
      .limit(1);

    if (credits.length === 0 || credits[0].balance < item.price_credits) {
      throw new Error('Insufficient credits');
    }

    // Check if user already owns this item (for decorations/badges)
    if (item.item_type === 'decoration') {
      const owned = await db.select()
        .from(userDecorations)
        .where(
          and(
            eq(userDecorations.user_id, userId),
            eq(userDecorations.decoration_id, item.item_id)
          )
        );

      if (owned.length > 0) {
        throw new Error('You already own this item');
      }
    } else if (item.item_type === 'badge') {
      const owned = await db.select()
        .from(userBadges)
        .where(
          and(
            eq(userBadges.user_id, userId),
            eq(userBadges.badge_id, item.item_id)
          )
        );

      if (owned.length > 0) {
        throw new Error('You already own this item');
      }
    }

    // Start transaction (using Promise.all for simplicity, can be improved with actual DB transactions)
    const updates: Promise<any>[] = [];

    // Deduct credits
    updates.push(
      db.update(userCredits)
        .set({
          balance: credits[0].balance - item.price_credits,
          updatedAt: new Date(),
        })
        .where(eq(userCredits.userId, userId))
    );

    // Add item to inventory
    if (item.item_type === 'decoration') {
      updates.push(
        db.insert(userDecorations).values({
          user_id: userId,
          decoration_id: item.item_id,
          is_equipped: false,
          acquired_at: new Date(),
        })
      );
    } else if (item.item_type === 'badge') {
      updates.push(
        db.insert(userBadges).values({
          user_id: userId,
          badge_id: item.item_id,
          is_equipped: false,
          acquired_at: new Date(),
        })
      );
    } else if (item.item_type === 'credit_pack') {
      // For credit packs, just add the credits (already deducted above, so net zero)
      // Actually, credit packs are purchased with money, not credits
      // So this shouldn't happen in this flow
      throw new Error('Credit packs cannot be purchased with credits');
    }

    // Create transaction record
    updates.push(
      db.insert(transactions).values({
        userId,
        transactionType: 'shop_purchase',
        amount: item.price_credits,
        currency: 'CREDITS',
        status: 'completed',
        paymentMethod: 'credits',
        txHash: null,
        qrisTransactionId: null,
        itemPurchasedId: item.id,
        itemName: item.name,
        creditAmount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );

    await Promise.all(updates);

    return {
      success: true,
      message: `Successfully purchased ${item.name}`,
      item,
    };
  }

  /**
   * Purchase credit pack (with QRIS or crypto - called after payment)
   */
  async purchaseCreditPack(userId: number, creditAmount: number, paymentMethod: 'qris' | 'base_chain', transactionId?: number) {
    // Get or create user credits
    const credits = await db.select()
      .from(userCredits)
      .where(eq(userCredits.userId, userId))
      .limit(1);

    if (credits.length > 0) {
      await db.update(userCredits)
        .set({
          balance: credits[0].balance + creditAmount,
          updatedAt: new Date(),
        })
        .where(eq(userCredits.userId, userId));
    } else {
      await db.insert(userCredits).values({
        userId,
        balance: creditAmount,
        baseChainBalance: '0',
      });
    }

    // Update transaction status if provided
    if (transactionId) {
      await db.update(transactions)
        .set({
          status: 'completed',
          creditAmount,
          updatedAt: new Date(),
        })
        .where(eq(transactions.id, transactionId));
    }

    return {
      success: true,
      message: `Successfully added ${creditAmount} credits`,
      creditAmount,
    };
  }
}

export const shopService = new ShopService();
