import { db } from '../db';
import {
    quests as questsTable,
    userQuests as userQuestsTable,
    badges as badgesTable,
    userBadges as userBadgesTable,
    decorations as decorationsTable,
    userDecorations as userDecorationsTable,
} from '../db/schema';
import { eq, and, sql, lte, gte, or, isNull, ilike } from 'drizzle-orm';

export class QuestService {

    // ─── Public / User ───────────────────────────────────

    async getActiveQuests() {
        const now = new Date();
        return await db.select({
            id: questsTable.id,
            title: questsTable.title,
            description: questsTable.description,
            quest_type: questsTable.quest_type,
            target_value: questsTable.target_value,
            target_genre: questsTable.target_genre,
            reward_type: questsTable.reward_type,
            reward_badge_id: questsTable.reward_badge_id,
            reward_decoration_id: questsTable.reward_decoration_id,
            is_active: questsTable.is_active,
            starts_at: questsTable.starts_at,
            expires_at: questsTable.expires_at,
            created_at: questsTable.created_at,
            badge_name: badgesTable.name,
            badge_icon_url: badgesTable.icon_url,
            decoration_name: decorationsTable.name,
            decoration_image_url: decorationsTable.image_url,
        })
            .from(questsTable)
            .leftJoin(badgesTable, eq(questsTable.reward_badge_id, badgesTable.id))
            .leftJoin(decorationsTable, eq(questsTable.reward_decoration_id, decorationsTable.id))
            .where(
                and(
                    eq(questsTable.is_active, true),
                    or(isNull(questsTable.starts_at), lte(questsTable.starts_at, now)),
                    or(isNull(questsTable.expires_at), gte(questsTable.expires_at, now))
                )
            );
    }

    async getUserQuestProgress(userId: number) {
        const activeQuests = await this.getActiveQuests();
        const userProgress = await db.select()
            .from(userQuestsTable)
            .where(eq(userQuestsTable.user_id, userId));

        const progressMap = new Map(userProgress.map((p: any) => [p.quest_id, p]));

        return activeQuests.map((quest: any) => {
            const progress = progressMap.get(quest.id) as any;
            return {
                ...quest,
                progress: progress?.progress ?? 0,
                is_completed: progress?.is_completed ?? false,
                completed_at: progress?.completed_at ?? null,
            };
        });
    }

    async updateQuestProgress(userId: number, questType: string, genre?: string) {
        // Find matching active quests
        const now = new Date();
        let matchingQuests;

        if (questType === 'genre_read' && genre) {
            console.log(`[Quest] Looking for genre_read quests matching genre: "${genre}"`);
            matchingQuests = await db.select()
                .from(questsTable)
                .where(
                    and(
                        eq(questsTable.is_active, true),
                        eq(questsTable.quest_type, 'genre_read'),
                        ilike(questsTable.target_genre, genre),
                        or(isNull(questsTable.starts_at), lte(questsTable.starts_at, now)),
                        or(isNull(questsTable.expires_at), gte(questsTable.expires_at, now))
                    )
                );
            console.log(`[Quest] Found ${matchingQuests.length} matching quests for genre "${genre}"`);
        } else {
            matchingQuests = await db.select()
                .from(questsTable)
                .where(
                    and(
                        eq(questsTable.is_active, true),
                        eq(questsTable.quest_type, questType),
                        or(isNull(questsTable.starts_at), lte(questsTable.starts_at, now)),
                        or(isNull(questsTable.expires_at), gte(questsTable.expires_at, now))
                    )
                );
        }

        const results = [];

        for (const quest of matchingQuests) {
            // Upsert user_quest progress
            const [existing] = await db.select()
                .from(userQuestsTable)
                .where(
                    and(
                        eq(userQuestsTable.user_id, userId),
                        eq(userQuestsTable.quest_id, quest.id)
                    )
                );

            if (existing) {
                if (existing.is_completed) continue; // Already done

                const newProgress = (existing.progress ?? 0) + 1;
                const isCompleted = newProgress >= (quest.target_value ?? 1);

                await db.update(userQuestsTable)
                    .set({
                        progress: newProgress,
                        is_completed: isCompleted,
                        completed_at: isCompleted ? new Date() : null,
                    })
                    .where(eq(userQuestsTable.id, existing.id));

                if (isCompleted) {
                    await this.grantRewards(userId, quest);
                }

                console.log(`[Quest] Updated quest "${quest.title}" for user ${userId}: progress ${newProgress}/${quest.target_value}, completed: ${isCompleted}`);
                results.push({
                    quest_id: quest.id,
                    title: quest.title,
                    progress: newProgress,
                    target: quest.target_value,
                    completed: isCompleted,
                });
            } else {
                const isCompleted = 1 >= (quest.target_value ?? 1);

                await db.insert(userQuestsTable).values({
                    user_id: userId,
                    quest_id: quest.id,
                    progress: 1,
                    is_completed: isCompleted,
                    completed_at: isCompleted ? new Date() : null,
                });

                if (isCompleted) {
                    await this.grantRewards(userId, quest);
                }

                console.log(`[Quest] Started quest "${quest.title}" for user ${userId}: progress 1/${quest.target_value}, completed: ${isCompleted}`);
                results.push({
                    quest_id: quest.id,
                    title: quest.title,
                    progress: 1,
                    target: quest.target_value,
                    completed: isCompleted,
                });
            }
        }

        return results;
    }

    private async grantRewards(userId: number, quest: any) {
        // Grant badge reward
        if ((quest.reward_type === 'badge' || quest.reward_type === 'both') && quest.reward_badge_id) {
            const [existingBadge] = await db.select()
                .from(userBadgesTable)
                .where(
                    and(
                        eq(userBadgesTable.user_id, userId),
                        eq(userBadgesTable.badge_id, quest.reward_badge_id)
                    )
                );

            if (!existingBadge) {
                await db.insert(userBadgesTable).values({
                    user_id: userId,
                    badge_id: quest.reward_badge_id,
                });
            }
        }

        // Grant decoration reward
        if ((quest.reward_type === 'decoration' || quest.reward_type === 'both') && quest.reward_decoration_id) {
            const [existingDeco] = await db.select()
                .from(userDecorationsTable)
                .where(
                    and(
                        eq(userDecorationsTable.user_id, userId),
                        eq(userDecorationsTable.decoration_id, quest.reward_decoration_id)
                    )
                );

            if (!existingDeco) {
                await db.insert(userDecorationsTable).values({
                    user_id: userId,
                    decoration_id: quest.reward_decoration_id,
                });
            }
        }
    }

    async claimReward(userId: number, questId: number) {
        const [userQuest] = await db.select()
            .from(userQuestsTable)
            .where(
                and(
                    eq(userQuestsTable.user_id, userId),
                    eq(userQuestsTable.quest_id, questId)
                )
            );

        if (!userQuest) {
            throw new Error('Quest not found for this user');
        }

        if (!userQuest.is_completed) {
            throw new Error('Quest is not completed yet');
        }

        // Get quest details
        const [quest] = await db.select()
            .from(questsTable)
            .where(eq(questsTable.id, questId));

        if (!quest) throw new Error('Quest not found');

        await this.grantRewards(userId, quest);

        return { success: true, message: 'Rewards claimed!' };
    }

    // ─── Admin ───────────────────────────────────────────

    async getAllQuests() {
        return await db.select({
            id: questsTable.id,
            title: questsTable.title,
            description: questsTable.description,
            quest_type: questsTable.quest_type,
            target_value: questsTable.target_value,
            target_genre: questsTable.target_genre,
            reward_type: questsTable.reward_type,
            reward_badge_id: questsTable.reward_badge_id,
            reward_decoration_id: questsTable.reward_decoration_id,
            is_active: questsTable.is_active,
            created_by: questsTable.created_by,
            starts_at: questsTable.starts_at,
            expires_at: questsTable.expires_at,
            created_at: questsTable.created_at,
            badge_name: badgesTable.name,
            badge_icon_url: badgesTable.icon_url,
            decoration_name: decorationsTable.name,
            decoration_image_url: decorationsTable.image_url,
        })
            .from(questsTable)
            .leftJoin(badgesTable, eq(questsTable.reward_badge_id, badgesTable.id))
            .leftJoin(decorationsTable, eq(questsTable.reward_decoration_id, decorationsTable.id));
    }

    async createQuest(data: {
        title: string;
        description?: string;
        quest_type: string;
        target_value?: number;
        target_genre?: string;
        reward_type: string;
        reward_badge_id?: number;
        reward_decoration_id?: number;
        is_active?: boolean;
        created_by?: number;
        starts_at?: Date | null;
        expires_at?: Date | null;
    }) {
        const [quest] = await db.insert(questsTable).values({
            title: data.title,
            description: data.description,
            quest_type: data.quest_type,
            target_value: data.target_value ?? 1,
            target_genre: data.target_genre,
            reward_type: data.reward_type,
            reward_badge_id: data.reward_badge_id,
            reward_decoration_id: data.reward_decoration_id,
            is_active: data.is_active ?? true,
            created_by: data.created_by,
            starts_at: data.starts_at,
            expires_at: data.expires_at,
        }).returning();

        return quest;
    }

    async updateQuest(id: number, data: Partial<{
        title: string;
        description: string;
        quest_type: string;
        target_value: number;
        target_genre: string;
        reward_type: string;
        reward_badge_id: number;
        reward_decoration_id: number;
        is_active: boolean;
        starts_at: Date | null;
        expires_at: Date | null;
    }>) {
        const [quest] = await db.update(questsTable)
            .set(data)
            .where(eq(questsTable.id, id))
            .returning();

        return quest;
    }

    async deleteQuest(id: number) {
        // Delete user progress first
        await db.delete(userQuestsTable).where(eq(userQuestsTable.quest_id, id));
        // Delete quest
        await db.delete(questsTable).where(eq(questsTable.id, id));
    }
}

export const questService = new QuestService();
