import { db } from '../db';
import { users as usersTable, dailyUserActivity as dailyUserActivityTable } from '../db/schema';
import { eq, sql } from 'drizzle-orm';

// ─── Tier Definitions ─────────────────────────────

export interface TierInfo {
    tier: number;
    name: string;
    color: string;
    gradient: string;
    minXP: number;
    icon: string;
}

export const TIERS: TierInfo[] = [
    { tier: 1, name: 'Newbie', color: '#9CA3AF', gradient: 'from-gray-400 to-gray-500', minXP: 0, icon: '🌱' },
    { tier: 2, name: 'Reader', color: '#22C55E', gradient: 'from-green-400 to-emerald-500', minXP: 100, icon: '📖' },
    { tier: 3, name: 'Bookworm', color: '#3B82F6', gradient: 'from-blue-400 to-indigo-500', minXP: 500, icon: '📚' },
    { tier: 4, name: 'Otaku', color: '#A855F7', gradient: 'from-purple-400 to-violet-500', minXP: 2000, icon: '🎌' },
    { tier: 5, name: 'Weeb Lord', color: '#F59E0B', gradient: 'from-amber-400 to-yellow-500', minXP: 5000, icon: '👑' },
    { tier: 6, name: 'Legendary', color: '#EF4444', gradient: 'from-red-400 to-rose-500', minXP: 15000, icon: '🔥' },
];

// ─── XP Amounts ───────────────────────────────────

export const XP_AMOUNTS = {
    manga_read: 10,
    chapter_read: 5,
    quest_complete: 50,
    comment_post: 3,
    daily_login: 5,
} as const;

// ─── Service ──────────────────────────────────────

export class TierService {

    getTierFromXP(xp: number): TierInfo {
        let current = TIERS[0];
        for (const tier of TIERS) {
            if (xp >= tier.minXP) current = tier;
        }
        return current;
    }

    getNextTier(xp: number): TierInfo | null {
        const current = this.getTierFromXP(xp);
        return TIERS.find(t => t.tier === current.tier + 1) || null;
    }

    getProgressToNext(xp: number): { current: number; needed: number; percent: number } {
        const current = this.getTierFromXP(xp);
        const next = this.getNextTier(xp);
        if (!next) return { current: xp, needed: xp, percent: 100 };

        const xpInTier = xp - current.minXP;
        const xpNeeded = next.minXP - current.minXP;
        return {
            current: xpInTier,
            needed: xpNeeded,
            percent: Math.min(Math.round((xpInTier / xpNeeded) * 100), 100),
        };
    }

    async getUserTierInfo(userId: number) {
        const [user]: any = await db.select({
            xp: usersTable.xp,
            tier: usersTable.tier,
        }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

        if (!user) return null;

        const xp = user.xp || 0;
        const tierInfo = this.getTierFromXP(xp);
        const nextTier = this.getNextTier(xp);
        const progress = this.getProgressToNext(xp);

        return {
            xp,
            tier: tierInfo,
            next_tier: nextTier,
            progress,
            all_tiers: TIERS,
        };
    }

    async addXP(userId: number, amount: number, reason: string): Promise<{ xp: number; tieredUp: boolean; newTier?: TierInfo }> {
        // Get current XP
        const [user]: any = await db.select({
            xp: usersTable.xp,
            tier: usersTable.tier,
        }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

        if (!user) return { xp: 0, tieredUp: false };

        const oldXP = user.xp || 0;
        const newXP = oldXP + amount;
        const oldTier = this.getTierFromXP(oldXP);
        const newTier = this.getTierFromXP(newXP);
        const tieredUp = newTier.tier > oldTier.tier;

        // Update user
        await db.update(usersTable)
            .set({
                xp: newXP,
                tier: newTier.tier,
            })
            .where(eq(usersTable.id, userId));

        if (tieredUp) {
            console.log(`[Tier] User ${userId} leveled up to ${newTier.name} (${newXP} XP)`);
        }

        // --- Track Daily Activity ---
        try {
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            await db.insert(dailyUserActivityTable)
                .values({
                    user_id: userId,
                    date: today,
                    xp_gained: amount,
                    actions_count: 1,
                })
                .onConflictDoUpdate({
                    target: [dailyUserActivityTable.user_id, dailyUserActivityTable.date],
                    set: {
                        xp_gained: sql`${dailyUserActivityTable.xp_gained} + ${amount}`,
                        actions_count: sql`${dailyUserActivityTable.actions_count} + 1`,
                    }
                });
        } catch (error) {
            console.error('[Tier] Failed to track daily activity:', error);
        }

        return { xp: newXP, tieredUp, newTier: tieredUp ? newTier : undefined };
    }
}

export const tierService = new TierService();
