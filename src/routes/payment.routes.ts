import { Hono } from 'hono';
import { blockchainService } from '../service/blockchainService';
import { shopService } from '../service/shopService';
import { db } from '../db';
import { transactions, userCredits } from '../db/schema';
import { eq } from 'drizzle-orm';

const routes = new Hono();

// QRIS Payment (Midtrans)
routes.post('/qris', async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { amount, credit_amount, item_id } = body;

    if (!amount || amount <= 0) {
      return c.json({ error: 'Invalid amount' }, 400);
    }

    // TODO: Integrate with Midtrans API
    // For now, create a mock transaction
    const result = await db.insert(transactions).values({
      userId: user.id,
      transactionType: 'credit_purchase',
      amount: amount,
      currency: 'IDR',
      status: 'pending',
      paymentMethod: 'qris',
      txHash: null,
      qrisTransactionId: `qris-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      itemPurchasedId: item_id || null,
      itemName: item_id ? `Shop Item ${item_id}` : 'Credits',
      creditAmount: credit_amount || 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning({ id: transactions.id });

    const transactionId = result[0]?.id.toString();

    // Mock QR code URL (in production, this comes from Midtrans)
    const qrUrl = `https://api.midtrans.com/v2/qr/ ${transactionId}`;

    return c.json({
      transaction_id: transactionId,
      qr_url: qrUrl,
      amount: amount,
      credit_amount: credit_amount || 0,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes
      instructions: [
        'Open your e-wallet app (GoPay, OVO, DANA, ShopeePay, etc.)',
        'Scan the QR code displayed on screen',
        'Confirm the payment amount',
        'Wait for confirmation (usually instant)',
      ],
    });
  } catch (error: any) {
    console.error('QRIS payment error:', error);
    return c.json({ error: 'Failed to initiate QRIS payment' }, 500);
  }
});

// Crypto Payment
routes.post('/crypto', async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { amount_wei, credit_amount } = body;

    if (!amount_wei || BigInt(amount_wei) <= 0) {
      return c.json({ error: 'Invalid amount' }, 400);
    }

    const paymentData = await blockchainService.generatePaymentAddress(
      user.id,
      Number(amount_wei),
      credit_amount || 0
    );

    return c.json(paymentData);
  } catch (error: any) {
    console.error('Crypto payment error:', error);
    return c.json({ error: 'Failed to initiate crypto payment' }, 500);
  }
});

// Verify Payment
routes.get('/verify', async (c) => {
  try {
    const transactionId = c.req.query('transaction_id');
    const method = c.req.query('method');

    if (!transactionId) {
      return c.json({ error: 'Missing transaction_id' }, 400);
    }

    const tx = await db.select()
      .from(transactions)
      .where(eq(transactions.id, parseInt(transactionId)))
      .limit(1);

    if (tx.length === 0) {
      return c.json({ error: 'Transaction not found' }, 404);
    }

    // If payment is completed, return success
    if (tx[0].status === 'completed') {
      return c.json({
        status: tx[0].status,
        payment_method: tx[0].paymentMethod,
        tx_hash: tx[0].txHash,
        credit_amount: tx[0].creditAmount,
      });
    }

    // For QRIS pending payments, check if we should auto-complete (mock for now)
    if (tx[0].status === 'pending' && tx[0].paymentMethod === 'qris') {
      // TODO: In production, check Midtrans API for payment status
      // For testing, auto-complete after 5 seconds
      const now = new Date();
      const createdAt = new Date(tx[0].createdAt);
      const diffMs = now.getTime() - createdAt.getTime();
      
      if (diffMs > 5000) { // Auto-complete after 5 seconds for testing
        await db.update(transactions)
          .set({ status: 'completed' })
          .where(eq(transactions.id, tx[0].id));

        // Add credits
        if (tx[0].creditAmount && tx[0].userId > 0) {
          const credits = await db.select()
            .from(userCredits)
            .where(eq(userCredits.userId, tx[0].userId))
            .limit(1);

          if (credits.length > 0) {
            await db.update(userCredits)
              .set({
                balance: credits[0].balance + tx[0].creditAmount,
                updatedAt: new Date(),
              })
              .where(eq(userCredits.userId, tx[0].userId));
          } else {
            await db.insert(userCredits).values({
              userId: tx[0].userId,
              balance: tx[0].creditAmount,
              baseChainBalance: '0',
            });
          }
        }

        return c.json({
          status: 'completed',
          payment_method: tx[0].paymentMethod,
          credit_amount: tx[0].creditAmount,
        });
      }
    }

    return c.json({
      status: tx[0].status,
      payment_method: tx[0].paymentMethod,
      tx_hash: tx[0].txHash,
    });
  } catch (error: any) {
    console.error('Payment verification error:', error);
    return c.json({ error: 'Failed to verify payment' }, 500);
  }
});

// Wallet Balance
routes.get('/wallet-balance', async (c) => {
  try {
    const balance = await blockchainService.getWalletBalance();
    const ethPrice = await blockchainService.getETHPrice();

    return c.json({
      ...balance,
      usd_value: (parseFloat(balance.balance_eth) * ethPrice).toFixed(2),
    });
  } catch (error: any) {
    console.error('Wallet balance error:', error);
    return c.json({ error: 'Failed to get wallet balance' }, 500);
  }
});

export default routes;
