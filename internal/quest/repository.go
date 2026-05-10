package quest

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) GetActiveQuests(ctx context.Context) ([]Quest, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT q.id, q.title, q.description, q.quest_type, q.target_value, q.target_genre,
		       q.reward_type, q.reward_badge_id, q.reward_decoration_id, q.is_active,
		       q.starts_at, q.expires_at, q.created_at,
		       b.name as badge_name, b.icon_url as badge_icon_url,
		       d.name as decoration_name, d.image_url as decoration_image_url
		FROM quests q
		LEFT JOIN badges b ON q.reward_badge_id = b.id
		LEFT JOIN decorations d ON q.reward_decoration_id = d.id
		WHERE q.is_active = true
		  AND (q.starts_at IS NULL OR q.starts_at <= NOW())
		  AND (q.expires_at IS NULL OR q.expires_at >= NOW())
		ORDER BY q.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanQuestRows(rows)
}

func (r *Repository) GetUserQuestProgress(ctx context.Context, userID int) ([]QuestProgress, error) {
	quests, err := r.GetActiveQuests(ctx)
	if err != nil {
		return nil, err
	}

	rows, err := r.pool.Query(ctx, `
		SELECT quest_id, progress, is_completed, completed_at
		FROM user_quests WHERE user_id = $1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	progressMap := make(map[int]*UserQuest)
	for rows.Next() {
		var uq UserQuest
		var completedAt interface{}
		if err := rows.Scan(&uq.QuestID, &uq.Progress, &uq.IsCompleted, &completedAt); err != nil {
			continue
		}
		uq.CompletedAt = completedAt
		progressMap[uq.QuestID] = &uq
	}

	var results []QuestProgress
	for _, q := range quests {
		progress := progressMap[q.ID]
		if progress == nil {
			progress = &UserQuest{Progress: 0, IsCompleted: false}
		}
		results = append(results, QuestProgress{
			Quest:       q,
			Progress:    progress.Progress,
			IsCompleted: progress.IsCompleted,
			CompletedAt: progress.CompletedAt,
		})
	}
	return results, nil
}

func (r *Repository) GetUserQuestByID(ctx context.Context, userID, questID int) (*UserQuest, error) {
	var uq UserQuest
	var completedAt interface{}
	err := r.pool.QueryRow(ctx, `
		SELECT quest_id, progress, is_completed, completed_at
		FROM user_quests WHERE user_id = $1 AND quest_id = $2`, userID, questID).Scan(
		&uq.QuestID, &uq.Progress, &uq.IsCompleted, &completedAt)
	if err != nil {
		return nil, err
	}
	uq.CompletedAt = completedAt
	return &uq, nil
}

func (r *Repository) GetQuestByID(ctx context.Context, questID int) (*Quest, error) {
	var q Quest
	var badgeName, badgeIcon, decorationName, decorationImage interface{}
	err := r.pool.QueryRow(ctx, `
		SELECT q.id, q.title, q.description, q.quest_type, q.target_value, q.target_genre,
		       q.reward_type, q.reward_badge_id, q.reward_decoration_id, q.is_active,
		       q.starts_at, q.expires_at, q.created_at,
		       b.name, b.icon_url, d.name, d.image_url
		FROM quests q
		LEFT JOIN badges b ON q.reward_badge_id = b.id
		LEFT JOIN decorations d ON q.reward_decoration_id = d.id
		WHERE q.id = $1`, questID).Scan(
		&q.ID, &q.Title, &q.Description, &q.QuestType, &q.TargetValue, &q.TargetGenre,
		&q.RewardType, &q.RewardBadgeID, &q.RewardDecorationID, &q.IsActive,
		&q.StartsAt, &q.ExpiresAt, &q.CreatedAt,
		&badgeName, &badgeIcon, &decorationName, &decorationImage)
	if err != nil {
		return nil, err
	}
	q.BadgeName = strVal(badgeName)
	q.BadgeIconURL = strVal(badgeIcon)
	q.DecorationName = strVal(decorationName)
	q.DecorationImageURL = strVal(decorationImage)
	return &q, nil
}

func (r *Repository) ClaimReward(ctx context.Context, userID, questID int) error {
	// Get quest details
	quest, err := r.GetQuestByID(ctx, questID)
	if err != nil {
		return fmt.Errorf("quest not found")
	}

	// Check if user has completed the quest
	uq, err := r.GetUserQuestByID(ctx, userID, questID)
	if err != nil || !uq.IsCompleted {
		return fmt.Errorf("quest is not completed yet")
	}

	// Grant badge reward
	if (quest.RewardType == "badge" || quest.RewardType == "both") && quest.RewardBadgeID != nil {
		var exists bool
		_ = r.pool.QueryRow(ctx, `
			SELECT EXISTS(SELECT 1 FROM user_badges WHERE user_id = $1 AND badge_id = $2)`,
			userID, *quest.RewardBadgeID).Scan(&exists)
		if !exists {
			_, _ = r.pool.Exec(ctx, `
				INSERT INTO user_badges (user_id, badge_id) VALUES ($1, $2)`,
				userID, *quest.RewardBadgeID)
		}
	}

	// Grant decoration reward
	if (quest.RewardType == "decoration" || quest.RewardType == "both") && quest.RewardDecorationID != nil {
		var exists bool
		_ = r.pool.QueryRow(ctx, `
			SELECT EXISTS(SELECT 1 FROM user_decorations WHERE user_id = $1 AND decoration_id = $2)`,
			userID, *quest.RewardDecorationID).Scan(&exists)
		if !exists {
			_, _ = r.pool.Exec(ctx, `
				INSERT INTO user_decorations (user_id, decoration_id) VALUES ($1, $2)`,
				userID, *quest.RewardDecorationID)
		}
	}

	return nil
}

func (r *Repository) GetAllQuests(ctx context.Context) ([]Quest, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT q.id, q.title, q.description, q.quest_type, q.target_value, q.target_genre,
		       q.reward_type, q.reward_badge_id, q.reward_decoration_id, q.is_active,
		       q.starts_at, q.expires_at, q.created_at,
		       b.name as badge_name, b.icon_url as badge_icon_url,
		       d.name as decoration_name, d.image_url as decoration_image_url
		FROM quests q
		LEFT JOIN badges b ON q.reward_badge_id = b.id
		LEFT JOIN decorations d ON q.reward_decoration_id = d.id
		ORDER BY q.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanQuestRows(rows)
}

func scanQuestRows(rows pgx.Rows) ([]Quest, error) {
	var results []Quest
	for rows.Next() {
		var q Quest
		var badgeName, badgeIcon, decorationName, decorationImage interface{}
		if err := rows.Scan(&q.ID, &q.Title, &q.Description, &q.QuestType, &q.TargetValue, &q.TargetGenre,
			&q.RewardType, &q.RewardBadgeID, &q.RewardDecorationID, &q.IsActive,
			&q.StartsAt, &q.ExpiresAt, &q.CreatedAt,
			&badgeName, &badgeIcon, &decorationName, &decorationImage); err != nil {
			continue
		}
		q.BadgeName = strVal(badgeName)
		q.BadgeIconURL = strVal(badgeIcon)
		q.DecorationName = strVal(decorationName)
		q.DecorationImageURL = strVal(decorationImage)
		results = append(results, q)
	}
	return results, rows.Err()
}

func strVal(v interface{}) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

type Quest struct {
	ID                 int         `json:"id"`
	Title              string      `json:"title"`
	Description        string      `json:"description"`
	QuestType          string      `json:"quest_type"`
	TargetValue        int         `json:"target_value"`
	TargetGenre        *string     `json:"target_genre"`
	RewardType         string      `json:"reward_type"`
	RewardBadgeID      *int        `json:"reward_badge_id"`
	RewardDecorationID *int        `json:"reward_decoration_id"`
	IsActive           bool        `json:"is_active"`
	StartsAt           interface{} `json:"starts_at"`
	ExpiresAt          interface{} `json:"expires_at"`
	CreatedAt          interface{} `json:"created_at"`
	BadgeName          string      `json:"badge_name,omitempty"`
	BadgeIconURL       string      `json:"badge_icon_url,omitempty"`
	DecorationName     string      `json:"decoration_name,omitempty"`
	DecorationImageURL string      `json:"decoration_image_url,omitempty"`
}

type UserQuest struct {
	QuestID     int         `json:"quest_id"`
	Progress    int         `json:"progress"`
	IsCompleted bool        `json:"is_completed"`
	CompletedAt interface{} `json:"completed_at"`
}

type QuestProgress struct {
	Quest       Quest       `json:"quest"`
	Progress    int         `json:"progress"`
	IsCompleted bool        `json:"is_completed"`
	CompletedAt interface{} `json:"completed_at"`
}

type CreateQuestInput struct {
	Title              string      `json:"title"`
	Description        *string     `json:"description"`
	QuestType          string      `json:"quest_type"`
	TargetValue        *int        `json:"target_value"`
	TargetGenre        *string     `json:"target_genre"`
	RewardType         string      `json:"reward_type"`
	RewardBadgeID      *int        `json:"reward_badge_id"`
	RewardDecorationID *int        `json:"reward_decoration_id"`
	IsActive           *bool       `json:"is_active"`
	StartsAt           interface{} `json:"starts_at"`
	ExpiresAt          interface{} `json:"expires_at"`
}

type UpdateQuestInput struct {
	Title              *string     `json:"title"`
	Description        *string     `json:"description"`
	QuestType          *string     `json:"quest_type"`
	TargetValue        *int        `json:"target_value"`
	TargetGenre        *string     `json:"target_genre"`
	RewardType         *string     `json:"reward_type"`
	RewardBadgeID      *int        `json:"reward_badge_id"`
	RewardDecorationID *int        `json:"reward_decoration_id"`
	IsActive           *bool       `json:"is_active"`
	StartsAt           interface{} `json:"starts_at"`
	ExpiresAt          interface{} `json:"expires_at"`
}

func (r *Repository) CreateQuest(ctx context.Context, input CreateQuestInput, createdBy int) (*Quest, error) {
	tv := 1
	if input.TargetValue != nil {
		tv = *input.TargetValue
	}
	isActive := true
	if input.IsActive != nil {
		isActive = *input.IsActive
	}
	var id int
	err := r.pool.QueryRow(ctx, `
		INSERT INTO quests (title, description, quest_type, target_value, target_genre, reward_type, reward_badge_id, reward_decoration_id, is_active, created_by, starts_at, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		RETURNING id`,
		input.Title, input.Description, input.QuestType, tv, input.TargetGenre,
		input.RewardType, input.RewardBadgeID, input.RewardDecorationID, isActive, createdBy,
		input.StartsAt, input.ExpiresAt).Scan(&id)
	if err != nil {
		return nil, err
	}
	return r.GetQuestByID(ctx, id)
}

func (r *Repository) UpdateQuest(ctx context.Context, id int, input UpdateQuestInput) (*Quest, error) {
	fields := []string{}
	args := []any{id}
	idx := 2

	addField := func(name string, val any) {
		fields = append(fields, fmt.Sprintf("%s = $%d", name, idx))
		args = append(args, val)
		idx++
	}

	if input.Title != nil {
		addField("title", *input.Title)
	}
	if input.Description != nil {
		addField("description", *input.Description)
	}
	if input.QuestType != nil {
		addField("quest_type", *input.QuestType)
	}
	if input.TargetValue != nil {
		addField("target_value", *input.TargetValue)
	}
	if input.TargetGenre != nil {
		addField("target_genre", *input.TargetGenre)
	}
	if input.RewardType != nil {
		addField("reward_type", *input.RewardType)
	}
	if input.RewardBadgeID != nil {
		addField("reward_badge_id", *input.RewardBadgeID)
	}
	if input.RewardDecorationID != nil {
		addField("reward_decoration_id", *input.RewardDecorationID)
	}
	if input.IsActive != nil {
		addField("is_active", *input.IsActive)
	}
	if input.StartsAt != nil {
		addField("starts_at", input.StartsAt)
	}
	if input.ExpiresAt != nil {
		addField("expires_at", input.ExpiresAt)
	}

	if len(fields) == 0 {
		return r.GetQuestByID(ctx, id)
	}

	query := fmt.Sprintf("UPDATE quests SET %s WHERE id = $1", strings.Join(fields, ", "))
	_, err := r.pool.Exec(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	return r.GetQuestByID(ctx, id)
}

func (r *Repository) DeleteQuest(ctx context.Context, id int) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM user_quests WHERE quest_id = $1`, id)
	if err != nil {
		return err
	}
	_, err = r.pool.Exec(ctx, `DELETE FROM quests WHERE id = $1`, id)
	return err
}
