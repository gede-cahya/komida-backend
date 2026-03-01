// ============================================================================
// COPY FILE INI KE: /home/cahya/2026/komida-backend/src/service/blockchainService.ts
// ============================================================================

import { createPublicClient, http, parseEther, Address, formatEther } from 'viem';
import { base } from 'viem/chains';
import { db } from '../db';
import { transactions, userCredits } from '../db/schema';
import { eq, and, gt } from 'drizzle-orm';

// Wallet address Anda untuk menerima payment
const PAYMENT_WALLET_ADDRESS = '0x2645ceE3a2453D1B3d050796193504aD8e402d08' as Address;

// Setup Base Chain Client
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
});

// Track transaction yang sudah diproses (in-memory cache)
const processedTransactions = new Set<string>();

// Track last processed block
let lastProcessedBlock: bigint | null = null;

export class BlockchainService {
  
  /**
   * Monitor incoming transactions ke wallet
   * Call ini setiap 30 detik - 1 menit
   */
  async monitorPayments() {
    try {
      console.log('🔍 Monitoring blockchain for payments...');
      
      // Get latest block
      const currentBlock = await publicClient.getBlockNumber();
      
      // Start from last processed block or 100 blocks ago
      const fromBlock = lastProcessedBlock 
        ? lastProcessedBlock + BigInt(1)
        : currentBlock - BigInt(100);
      
      console.log(`📊 Checking blocks ${fromBlock} to ${currentBlock}`);
      
      // Check direct ETH transfers to our wallet
      await this.checkDirectTransfers(fromBlock, currentBlock);
      
      // Update last processed block
      lastProcessedBlock = currentBlock;
      
      console.log(`✅ Blockchain check completed at block ${currentBlock}`);
    } catch (error: any) {
      console.error('❌ Error monitoring blockchain:', error.message);
    }
  }
  
  /**
   * Check direct ETH transfers to wallet
   */
  private async checkDirectTransfers(fromBlock: bigint, toBlock: bigint) {
    // Get all blocks in range
    for (let blockNum = Number(fromBlock); blockNum <= Number(toBlock); blockNum++) {
      try {
        const block = await publicClient.getBlock({ blockNumber: BigInt(blockNum) });
        
        // Check each transaction in block
        for (const txHash of block.transactions) {
          const tx = await publicClient.getTransaction({ hash: txHash });
          
          // Check if transaction is to our wallet
          if (tx.to?.toLowerCase() === PAYMENT_WALLET_ADDRESS.toLowerCase()) {
            await this.processPayment(tx);
          }
        }
      } catch (error) {
        console.error(`Error checking block ${blockNum}:`, error);
        // Continue to next block
      }
    }
  }
  
  /**
   * Process incoming payment
   */
  private async processPayment(tx: any) {
    const txHash = tx.hash;
    
    // Skip if already processed
    if (processedTransactions.has(txHash)) {
      console.log(`⏭️  Skipping already processed: ${txHash}`);
      return;
    }
    
    try {
      // Check if transaction already exists in database with completed status
      const existingCompleted = await db.select()
        .from(transactions)
        .where(
          and(
            eq(transactions.txHash!, txHash),
            eq(transactions.status, 'completed')
          )
        )
        .limit(1);
      
      if (existingCompleted.length > 0) {
        processedTransactions.add(txHash);
        console.log(`✅ Already completed: ${txHash}`);
        return;
      }
      
      // Get transaction value in ETH
      const ethAmount = formatEther(tx.value);
      const ethAmountWei = tx.value.toString();
      
      console.log(`💰 Detected payment: ${ethAmount} ETH from ${tx.from} - Hash: ${txHash}`);
      
      // Find matching pending transaction
      // Look for transactions created in last 24 hours
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const pendingTransactions = await db.select()
        .from(transactions)
        .where(
          and(
            eq(transactions.status, 'pending'),
            eq(transactions.paymentMethod, 'base_chain'),
            gt(transactions.createdAt, twentyFourHoursAgo)
          )
        )
        .limit(50);
      
      // Match transaction by amount (with small tolerance for gas differences)
      const matchedTx = pendingTransactions.find(dbTx => {
        const dbAmountEth = formatEther(BigInt(dbTx.amount));
        const difference = Math.abs(parseFloat(dbAmountEth) - parseFloat(ethAmount));
        return difference < 0.0001; // Allow very small difference
      });
      
      if (matchedTx) {
        console.log(`🎯 Matched transaction: User ${matchedTx.userId} - ${matchedTx.creditAmount} credits`);
        
        // Update transaction status to completed
        await db.update(transactions)
          .set({
            status: 'completed',
            txHash: txHash,
            updatedAt: new Date(),
          })
          .where(eq(transactions.id, matchedTx.id));
        
        // Add credits to user
        await this.addCredits(matchedTx.userId, matchedTx.creditAmount || 0);
        
        // Mark as processed
        processedTransactions.add(txHash);
        
        console.log(`✅ Payment completed: User ${matchedTx.userId} received ${matchedTx.creditAmount} credits`);
      } else {
        console.log(`⚠️  Unmatched payment: ${txHash} - ${ethAmount} ETH from ${tx.from}`);
        
        // Optional: Create a new transaction record for unmatched payments
        // This can be reviewed manually later
        await this.createUnmatchedTransaction(tx, ethAmountWei);
      }
    } catch (error: any) {
      console.error(`❌ Error processing payment ${txHash}:`, error.message);
    }
  }
  
  /**
   * Create transaction record for unmatched payments
   */
  private async createUnmatchedTransaction(tx: any, amountWei: string) {
    try {
      // Check if we already have this transaction
      const existing = await db.select()
        .from(transactions)
        .where(eq(transactions.txHash!, tx.hash))
        .limit(1);
      
      if (existing.length > 0) {
        return;
      }
      
      // Create a new transaction record with null user_id
      // This can be manually matched later by admin
      await db.insert(transactions).values({
        userId: 0, // 0 indicates unmatched/anonymous payment
        transactionType: 'credit_purchase',
        amount: Number(amountWei),
        currency: 'ETH',
        status: 'pending', // Keep as pending until manually matched
        paymentMethod: 'base_chain',
        txHash: tx.hash,
        creditAmount: 0, // To be determined
        itemName: 'Unmatched Payment',
        createdAt: new Date(),
      });
      
      console.log(`📝 Created unmatched transaction record for ${tx.hash}`);
    } catch (error) {
      console.error('Error creating unmatched transaction:', error);
    }
  }
  
  /**
   * Add credits to user
   */
  private async addCredits(userId: number, amount: number) {
    if (userId <= 0 || amount <= 0) {
      console.error('Invalid userId or amount');
      return;
    }
    
    try {
      // Check if user has credits entry
      const existing = await db.select()
        .from(userCredits)
        .where(eq(userCredits.userId, userId))
        .limit(1);
      
      if (existing.length > 0) {
        // Update existing
        await db.update(userCredits)
          .set({
            balance: existing[0].balance + amount,
            baseChainBalance: existing[0].baseChainBalance,
            updatedAt: new Date(),
          })
          .where(eq(userCredits.userId, userId));
        
        console.log(`💵 Updated credits for user ${userId}: +${amount} (new balance: ${existing[0].balance + amount})`);
      } else {
        // Create new
        await db.insert(userCredits).values({
          userId,
          balance: amount,
          baseChainBalance: '0',
        });
        
        console.log(`💵 Created credits for user ${userId}: ${amount}`);
      }
    } catch (error: any) {
      console.error('Error adding credits:', error.message);
    }
  }
  
  /**
   * Generate payment instruction for user
   */
  async generatePaymentAddress(userId: number, amountWei: number, creditAmount: number) {
    const txHash = `pending-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    // Save pending transaction
    const result = await db.insert(transactions).values({
      userId,
      transactionType: 'credit_purchase',
      amount: amountWei,
      currency: 'ETH',
      status: 'pending',
      paymentMethod: 'base_chain',
      txHash: null,
      qrisTransactionId: null,
      itemPurchasedId: null,
      itemName: null,
      creditAmount,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning({ id: transactions.id });
    
    const transactionId = result[0]?.id.toString() || txHash;
    
    return {
      transaction_id: transactionId,
      wallet_address: PAYMENT_WALLET_ADDRESS,
      amount_eth: (amountWei / 1e18).toFixed(6), // Convert wei to ETH
      amount_wei: amountWei.toString(),
      credit_amount: creditAmount,
      chain_id: 8453, // Base Mainnet
      network: 'Base Mainnet',
      rpc_url: 'https://mainnet.base.org',
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes
      instructions: [
        `Send exactly ${(amountWei / 1e18).toFixed(6)} ETH to the wallet address`,
        'Make sure you are on Base Mainnet (Chain ID: 8453)',
        'Wait for blockchain confirmation (usually 1-2 minutes)',
        'Credits will be added automatically after confirmation',
      ],
    };
  }
  
  /**
   * Get current ETH balance of payment wallet
   */
  async getWalletBalance() {
    try {
      const balance = await publicClient.getBalance({
        address: PAYMENT_WALLET_ADDRESS,
      });
      
      return {
        balance_wei: balance.toString(),
        balance_eth: formatEther(balance),
        address: PAYMENT_WALLET_ADDRESS,
      };
    } catch (error: any) {
      console.error('Error getting wallet balance:', error.message);
      return {
        balance_wei: '0',
        balance_eth: '0',
        address: PAYMENT_WALLET_ADDRESS,
        error: error.message,
      };
    }
  }
  
  /**
   * Get current ETH price in USD (from external API)
   */
  async getETHPrice() {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
      const data = await response.json();
      return data.ethereum.usd;
    } catch {
      return 2500; // Fallback price
    }
  }
  
  /**
   * Manual credit addition (for admin use)
   */
  async manualAddCredits(userId: number, amount: number, reason: string) {
    try {
      await this.addCredits(userId, amount);
      
      // Create transaction record
      await db.insert(transactions).values({
        userId,
        transactionType: 'credit_purchase',
        amount: 0,
        currency: 'CREDITS',
        status: 'completed',
        paymentMethod: 'base_chain',
        txHash: null,
        creditAmount: amount,
        itemName: `Manual: ${reason}`,
        createdAt: new Date(),
      });
      
      return { success: true, message: `Added ${amount} credits to user ${userId}` };
    } catch (error: any) {
      console.error('Error in manual credit addition:', error.message);
      return { success: false, error: error.message };
    }
  }
}

export const blockchainService = new BlockchainService();

// ============================================================================
// END OF FILE - Copy ke backend Anda
// ============================================================================
