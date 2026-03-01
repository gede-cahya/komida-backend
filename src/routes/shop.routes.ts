import { Hono } from 'hono';
import { shopService, DEFAULT_SHOP_ITEMS } from '../service/shopService';
import { db } from '../db';
import { userCredits, transactions } from '../db/schema';
import { eq } from 'drizzle-orm';

const routes = new Hono();

// Get shop items
routes.get('/items', async (c) => {
  try {
    const items = await shopService.getShopItems();
    return c.json({ items });
  } catch (error: any) {
    console.error('Shop items error:', error);
    return c.json({ error: 'Failed to get shop items' }, 500);
  }
});

// Purchase item with credits
routes.post('/purchase', async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { item_id } = body;

    if (!item_id) {
      return c.json({ error: 'item_id is required' }, 400);
    }

    const result = await shopService.purchaseItemWithCredits(user.id, item_id);
    return c.json(result);
  } catch (error: any) {
    console.error('Purchase error:', error);
    return c.json({ error: error.message || 'Purchase failed' }, 400);
  }
});

// Get credit packs
routes.get('/credit-packs', async (c) => {
  try {
    const creditPacks = DEFAULT_SHOP_ITEMS.filter(item => item.item_type === 'credit_pack');
    return c.json({ credit_packs: creditPacks });
  } catch (error: any) {
    console.error('Credit packs error:', error);
    return c.json({ error: 'Failed to get credit packs' }, 500);
  }
});

// Get decorations
routes.get('/decorations', async (c) => {
  try {
    const decorations = DEFAULT_SHOP_ITEMS.filter(item => item.item_type === 'decoration');
    return c.json({ decorations });
  } catch (error: any) {
    console.error('Decorations error:', error);
    return c.json({ error: 'Failed to get decorations' }, 500);
  }
});

export default routes;
