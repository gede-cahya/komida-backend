import { db } from '../db';
import { badges as badgesTable, userBadges as userBadgesTable, users as usersTable } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { createPublicClient, http, Address } from 'viem';
import { base } from 'viem/chains';

const MINIMAL_ABI = [
    {
        constant: true,
        inputs: [{ name: "_owner", type: "address" }],
        name: "balanceOf",
        outputs: [{ name: "balance", type: "uint256" }],
        type: "function",
    },
] as const;

export class BadgeService {
    private client = createPublicClient({
        chain: base,
        transport: http()
    });

    async getAllBadges() {
        return await db.select().from(badgesTable);
    }

    async getUserBadges(userId: number) {
        return await db.select({
            id: badgesTable.id,
            name: badgesTable.name,
            icon_url: badgesTable.icon_url,
            type: badgesTable.type,
            is_equipped: userBadgesTable.is_equipped,
            acquired_at: userBadgesTable.acquired_at
        })
            .from(userBadgesTable)
            .innerJoin(badgesTable, eq(userBadgesTable.badge_id, badgesTable.id))
            .where(eq(userBadgesTable.user_id, userId));
    }

    async syncNFTBadges(userId: number) {
        const [user]: any = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
        if (!user || !user.wallet_address) return { success: false, message: "No wallet linked" };

        const nftBadges = await db.select()
            .from(badgesTable)
            .where(eq(badgesTable.type, 'nft'));

        const newlyAcquired = [];

        for (const badge of nftBadges) {
            if (!badge.nft_contract_address) continue;

            try {
                const balance = await this.client.readContract({
                    address: badge.nft_contract_address as Address,
                    abi: MINIMAL_ABI,
                    functionName: 'balanceOf',
                    args: [user.wallet_address as Address],
                });

                if (Number(balance) > 0) {
                    const [existing] = await db.select()
                        .from(userBadgesTable)
                        .where(
                            and(
                                eq(userBadgesTable.user_id, userId),
                                eq(userBadgesTable.badge_id, badge.id)
                            )
                        );

                    if (!existing) {
                        await db.insert(userBadgesTable).values({
                            user_id: userId,
                            badge_id: badge.id,
                        });
                        newlyAcquired.push(badge.name);
                    }
                }
            } catch (e) {
                console.error(`Failed to verify NFT ownership for badge ${badge.name}:`, e);
            }
        }

        return { success: true, newlyAcquired };
    }

    // ─── Admin CRUD ───────────────────────────────────

    async createBadge(data: { name: string; description?: string; icon_url: string; type?: string }) {
        const [badge] = await db.insert(badgesTable).values({
            name: data.name,
            description: data.description,
            icon_url: data.icon_url,
            type: data.type || 'achievement',
        }).returning();
        return badge;
    }

    async updateBadge(id: number, data: Partial<{ name: string; description: string; icon_url: string; type: string }>) {
        const [badge] = await db.update(badgesTable)
            .set(data)
            .where(eq(badgesTable.id, id))
            .returning();
        return badge;
    }

    async deleteBadge(id: number) {
        // Remove user associations first
        await db.delete(userBadgesTable).where(eq(userBadgesTable.badge_id, id));
        await db.delete(badgesTable).where(eq(badgesTable.id, id));
    }
}

export const badgeService = new BadgeService();
