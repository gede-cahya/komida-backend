package user

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) GetByUsername(ctx context.Context, username string) (*User, error) {
	var u User
	err := r.pool.QueryRow(ctx, `
		SELECT id, username, password, role, email, display_name, avatar_url, wallet_address, is_banned, xp, tier, created_at
		FROM users WHERE username = $1`, username,
	).Scan(&u.ID, &u.Username, &u.Password, &u.Role, &u.Email, &u.DisplayName, &u.AvatarURL, &u.WalletAddress, &u.IsBanned, &u.XP, &u.Tier, &u.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &u, nil
}

func (r *Repository) GetByID(ctx context.Context, id int) (*Profile, error) {
	var p Profile
	err := r.pool.QueryRow(ctx, `
		SELECT id, username, role, email, display_name, avatar_url, wallet_address, is_banned, xp, tier, created_at
		FROM users WHERE id = $1`, id,
	).Scan(&p.ID, &p.Username, &p.Role, &p.Email, &p.DisplayName, &p.AvatarURL, &p.WalletAddress, &p.IsBanned, &p.XP, &p.Tier, &p.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	// Fetch equipped decoration
	var decorationURL *string
	_ = r.pool.QueryRow(ctx, `
		SELECT d.image_url FROM user_decorations ud
		INNER JOIN decorations d ON ud.decoration_id = d.id
		WHERE ud.user_id = $1 AND ud.is_equipped = true LIMIT 1`, id,
	).Scan(&decorationURL)
	p.DecorationURL = decorationURL

	// Fetch equipped badges
	rows, err := r.pool.Query(ctx, `
		SELECT b.name, b.icon_url FROM user_badges ub
		INNER JOIN badges b ON ub.badge_id = b.id
		WHERE ub.user_id = $1 AND ub.is_equipped = true`, id)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var b Badge
			_ = rows.Scan(&b.Name, &b.IconURL)
			p.Badges = append(p.Badges, b)
		}
	}
	return &p, nil
}

func (r *Repository) Create(ctx context.Context, username, password, role string) (*User, error) {
	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	var u User
	err = r.pool.QueryRow(ctx, `
		INSERT INTO users (username, password, role)
		VALUES ($1, $2, $3)
		RETURNING id, username, password, role, email, display_name, avatar_url, wallet_address, is_banned, xp, tier, created_at`,
		username, string(hashed), role,
	).Scan(&u.ID, &u.Username, &u.Password, &u.Role, &u.Email, &u.DisplayName, &u.AvatarURL, &u.WalletAddress, &u.IsBanned, &u.XP, &u.Tier, &u.CreatedAt)
	if err != nil {
		if strings.Contains(err.Error(), "unique constraint") || strings.Contains(err.Error(), "duplicate key") {
			return nil, fmt.Errorf("username already exists")
		}
		return nil, err
	}
	return &u, nil
}

func (r *Repository) VerifyPassword(ctx context.Context, username, password string) (*User, error) {
	u, err := r.GetByUsername(ctx, username)
	if err != nil {
		return nil, err
	}
	if u == nil {
		return nil, errors.New("invalid credentials")
	}
	if u.IsBanned {
		return nil, errors.New("account is banned")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(password)); err != nil {
		return nil, errors.New("invalid credentials")
	}
	return u, nil
}

func (r *Repository) UpdateProfile(ctx context.Context, id int, input UpdateProfileInput) (*Profile, error) {
	fields := []string{}
	args := []any{id}
	idx := 2
	if input.DisplayName != nil {
		fields = append(fields, fmt.Sprintf("display_name = $%d", idx))
		args = append(args, *input.DisplayName)
		idx++
	}
	if input.Email != nil {
		fields = append(fields, fmt.Sprintf("email = $%d", idx))
		args = append(args, *input.Email)
		idx++
	}
	if input.AvatarURL != nil {
		fields = append(fields, fmt.Sprintf("avatar_url = $%d", idx))
		args = append(args, *input.AvatarURL)
		idx++
	}
	if len(fields) == 0 {
		return r.GetByID(ctx, id)
	}
	query := fmt.Sprintf(`UPDATE users SET %s WHERE id = $1
		RETURNING id, username, role, email, display_name, avatar_url, wallet_address, is_banned, xp, tier, created_at`,
		strings.Join(fields, ", "))
	var p Profile
	err := r.pool.QueryRow(ctx, query, args...).Scan(
		&p.ID, &p.Username, &p.Role, &p.Email, &p.DisplayName, &p.AvatarURL, &p.WalletAddress, &p.IsBanned, &p.XP, &p.Tier, &p.CreatedAt)
	if err != nil {
		if strings.Contains(err.Error(), "unique constraint") || strings.Contains(err.Error(), "duplicate key") {
			return nil, fmt.Errorf("email already in use")
		}
		return nil, err
	}
	return &p, nil
}

func (r *Repository) GetUserDecorations(ctx context.Context, userID int) ([]map[string]any, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT d.id, d.name, d.image_url, d.type, ud.is_equipped
		FROM user_decorations ud
		INNER JOIN decorations d ON ud.decoration_id = d.id
		WHERE ud.user_id = $1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var decorations []map[string]any
	for rows.Next() {
		var id int
		var name, imageURL, typ string
		var isEquipped bool
		if err := rows.Scan(&id, &name, &imageURL, &typ, &isEquipped); err != nil {
			continue
		}
		decorations = append(decorations, map[string]any{
			"id": id, "name": name, "image_url": imageURL, "type": typ, "is_equipped": isEquipped,
		})
	}
	return decorations, rows.Err()
}

func (r *Repository) GetUserBadges(ctx context.Context, userID int) ([]map[string]any, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT b.id, b.name, b.icon_url, b.description, b.rarity, ub.is_equipped
		FROM user_badges ub
		INNER JOIN badges b ON ub.badge_id = b.id
		WHERE ub.user_id = $1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var badges []map[string]any
	for rows.Next() {
		var id int
		var name, iconURL string
		var description, rarity *string
		var isEquipped bool
		if err := rows.Scan(&id, &name, &iconURL, &description, &rarity, &isEquipped); err != nil {
			continue
		}
		badges = append(badges, map[string]any{
			"id": id, "name": name, "icon_url": iconURL, "description": description,
			"rarity": rarity, "is_equipped": isEquipped,
		})
	}
	return badges, rows.Err()
}

func (r *Repository) GetUserCredits(ctx context.Context, userID int) (map[string]any, error) {
	var balance int
	var baseChainBalance string
	var updatedAt interface{}
	err := r.pool.QueryRow(ctx, `
		SELECT balance, base_chain_balance, updated_at
		FROM user_credits WHERE user_id = $1`, userID).Scan(&balance, &baseChainBalance, &updatedAt)
	if err != nil {
		// Create default credits entry
		_, _ = r.pool.Exec(ctx, `
			INSERT INTO user_credits (user_id, balance, base_chain_balance)
			VALUES ($1, 0, '0') ON CONFLICT (user_id) DO NOTHING`, userID)
		balance = 0
		baseChainBalance = "0"
	}
	return map[string]any{
		"user_id":            userID,
		"balance":            balance,
		"base_chain_balance": baseChainBalance,
		"updated_at":         updatedAt,
	}, nil
}

func (r *Repository) GetUserInventory(ctx context.Context, userID int) ([]map[string]any, error) {
	var inventory []map[string]any

	// Decorations
	decoRows, err := r.pool.Query(ctx, `
		SELECT d.id, 'decoration'::text, d.name, d.image_url, ud.acquired_at, ud.is_equipped
		FROM user_decorations ud
		INNER JOIN decorations d ON ud.decoration_id = d.id
		WHERE ud.user_id = $1`, userID)
	if err == nil {
		defer decoRows.Close()
		for decoRows.Next() {
			var id int
			var itemType, name, imageURL string
			var acquiredAt interface{}
			var isEquipped bool
			if err := decoRows.Scan(&id, &itemType, &name, &imageURL, &acquiredAt, &isEquipped); err != nil {
				continue
			}
			inventory = append(inventory, map[string]any{
				"item_id": id, "item_type": itemType, "name": name, "image_url": imageURL,
				"acquired_at": acquiredAt, "is_equipped": isEquipped,
			})
		}
	}

	// Badges
	badgeRows, err := r.pool.Query(ctx, `
		SELECT b.id, 'badge'::text, b.name, b.icon_url, ub.acquired_at, ub.is_equipped
		FROM user_badges ub
		INNER JOIN badges b ON ub.badge_id = b.id
		WHERE ub.user_id = $1`, userID)
	if err == nil {
		defer badgeRows.Close()
		for badgeRows.Next() {
			var id int
			var itemType, name, imageURL string
			var acquiredAt interface{}
			var isEquipped bool
			if err := badgeRows.Scan(&id, &itemType, &name, &imageURL, &acquiredAt, &isEquipped); err != nil {
				continue
			}
			inventory = append(inventory, map[string]any{
				"item_id": id, "item_type": itemType, "name": name, "image_url": imageURL,
				"acquired_at": acquiredAt, "is_equipped": isEquipped,
			})
		}
	}

	return inventory, nil
}

func (r *Repository) GetOrCreateByWallet(ctx context.Context, walletAddress string) (*Profile, error) {
	var p Profile
	err := r.pool.QueryRow(ctx, `
		SELECT id, username, role, email, display_name, avatar_url, wallet_address, is_banned, xp, tier, created_at
		FROM users WHERE wallet_address = $1`, walletAddress).Scan(
		&p.ID, &p.Username, &p.Role, &p.Email, &p.DisplayName, &p.AvatarURL, &p.WalletAddress, &p.IsBanned, &p.XP, &p.Tier, &p.CreatedAt)
	if err == nil {
		return &p, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	// Create new user
	username := "wallet_" + walletAddress[len(walletAddress)-8:]
	err = r.pool.QueryRow(ctx, `
		INSERT INTO users (username, password, role, wallet_address)
		VALUES ($1, '', 'user', $2)
		ON CONFLICT (wallet_address) DO UPDATE SET wallet_address = EXCLUDED.wallet_address
		RETURNING id, username, role, email, display_name, avatar_url, wallet_address, is_banned, xp, tier, created_at`,
		username, walletAddress).Scan(
		&p.ID, &p.Username, &p.Role, &p.Email, &p.DisplayName, &p.AvatarURL, &p.WalletAddress, &p.IsBanned, &p.XP, &p.Tier, &p.CreatedAt)
	if err != nil {
		return nil, err
	}
	// Give 500 free credits
	_, _ = r.pool.Exec(ctx, `
		INSERT INTO user_credits (user_id, balance, base_chain_balance)
		VALUES ($1, 500, '0') ON CONFLICT (user_id) DO NOTHING`, p.ID)
	return &p, nil
}
