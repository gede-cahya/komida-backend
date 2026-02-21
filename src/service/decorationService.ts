import { db } from '../db';
import { decorations as decorationsTable, userDecorations as userDecorationsTable, users as usersTable } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { createPublicClient, http, Address } from 'viem';
import { base } from 'viem/chains';

// Minimal ERC721/1155 ABI for balanceOf
const MINIMAL_ABI = [
    {
        constant: true,
        inputs: [{ name: "_owner", type: "address" }],
        name: "balanceOf",
        outputs: [{ name: "balance", type: "uint256" }],
        type: "function",
    },
] as const;

export class DecorationService {
    private client = createPublicClient({
        chain: base,
        transport: http()
    });

    async getAllDecorations() {
        return await db.select().from(decorationsTable);
    }

    async getUserDecorations(userId: number) {
        return await db.select({
            id: decorationsTable.id,
            name: decorationsTable.name,
            image_url: decorationsTable.image_url,
            type: decorationsTable.type,
            is_equipped: userDecorationsTable.is_equipped,
            acquired_at: userDecorationsTable.acquired_at
        })
            .from(userDecorationsTable)
            .innerJoin(decorationsTable, eq(userDecorationsTable.decoration_id, decorationsTable.id))
            .where(eq(userDecorationsTable.user_id, userId));
    }

    async getEquippedDecoration(userId: number) {
        const results = await db.select({
            id: decorationsTable.id,
            name: decorationsTable.name,
            image_url: decorationsTable.image_url
        })
            .from(userDecorationsTable)
            .innerJoin(decorationsTable, eq(userDecorationsTable.decoration_id, decorationsTable.id))
            .where(
                and(
                    eq(userDecorationsTable.user_id, userId),
                    eq(userDecorationsTable.is_equipped, true)
                )
            )
            .limit(1);

        return results[0] || null;
    }

    async equipDecoration(userId: number, decorationId: number | null) {
        // 1. Unequip all
        await db.update(userDecorationsTable)
            .set({ is_equipped: false })
            .where(eq(userDecorationsTable.user_id, userId));

        if (decorationId === null) return { success: true, message: "Decoration unequipped" };

        // 2. Check if user owns it
        const [owned] = await db.select()
            .from(userDecorationsTable)
            .where(
                and(
                    eq(userDecorationsTable.user_id, userId),
                    eq(userDecorationsTable.decoration_id, decorationId)
                )
            );

        if (!owned) throw new Error("Decoration not owned");

        // 3. Equip
        await db.update(userDecorationsTable)
            .set({ is_equipped: true })
            .where(
                and(
                    eq(userDecorationsTable.user_id, userId),
                    eq(userDecorationsTable.decoration_id, decorationId)
                )
            );

        return { success: true };
    }

    async syncNFTDecorations(userId: number) {
        const [user]: any = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
        if (!user) return { success: false, message: "User not found" };

        const newlyAcquired = [];

        // 1. Sync Regular Decorations
        const regularDecorations = await db.select()
            .from(decorationsTable)
            .where(eq(decorationsTable.type, 'regular'));

        for (const decoration of regularDecorations) {
            const [existing] = await db.select()
                .from(userDecorationsTable)
                .where(
                    and(
                        eq(userDecorationsTable.user_id, userId),
                        eq(userDecorationsTable.decoration_id, decoration.id)
                    )
                );

            if (!existing) {
                await db.insert(userDecorationsTable).values({
                    user_id: userId,
                    decoration_id: decoration.id,
                });
                newlyAcquired.push(decoration.name);
            }
        }

        // 2. Sync NFT Decorations
        if (user.wallet_address) {
            const nftDecorations = await db.select()
                .from(decorationsTable)
                .where(eq(decorationsTable.type, 'nft'));

            for (const decoration of nftDecorations) {
                if (!decoration.nft_contract_address) continue;

                try {
                    const balance = await this.client.readContract({
                        address: decoration.nft_contract_address as Address,
                        abi: MINIMAL_ABI,
                        functionName: 'balanceOf',
                        args: [user.wallet_address as Address],
                    });

                    if (Number(balance) > 0) {
                        // Check if already in user_decorations
                        const [existing] = await db.select()
                            .from(userDecorationsTable)
                            .where(
                                and(
                                    eq(userDecorationsTable.user_id, userId),
                                    eq(userDecorationsTable.decoration_id, decoration.id)
                                )
                            );

                        if (!existing) {
                            await db.insert(userDecorationsTable).values({
                                user_id: userId,
                                decoration_id: decoration.id,
                            });
                            newlyAcquired.push(decoration.name);
                        }
                    }
                } catch (e) {
                    console.error(`Failed to verify NFT ownership for ${decoration.name}:`, e);
                }
            }
        }

        return { success: true, newlyAcquired };
    }

    // ─── Admin CRUD ───────────────────────────────────

    async createDecoration(data: { name: string; description?: string; image_url: string; type?: string }) {
        const [decoration] = await db.insert(decorationsTable).values({
            name: data.name,
            description: data.description,
            image_url: data.image_url,
            type: data.type || 'regular',
        }).returning();
        return decoration;
    }

    async updateDecoration(id: number, data: Partial<{ name: string; description: string; image_url: string; type: string }>) {
        const [decoration] = await db.update(decorationsTable)
            .set(data)
            .where(eq(decorationsTable.id, id))
            .returning();
        return decoration;
    }

    async deleteDecoration(id: number) {
        // Remove user associations first
        await db.delete(userDecorationsTable).where(eq(userDecorationsTable.decoration_id, id));
        await db.delete(decorationsTable).where(eq(decorationsTable.id, id));
    }
}

export const decorationService = new DecorationService();
