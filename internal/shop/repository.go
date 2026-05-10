package shop

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) PurchaseItemWithCredits(ctx context.Context, userID, itemID int) (map[string]any, error) {
	item := findItem(itemID)
	if item == nil {
		return nil, fmt.Errorf("item not found")
	}
	if !item.IsAvailable {
		return nil, fmt.Errorf("item is not available")
	}

	// Get user credits
	var balance int
	err := r.pool.QueryRow(ctx, `SELECT balance FROM user_credits WHERE user_id = $1`, userID).Scan(&balance)
	if err != nil {
		return nil, fmt.Errorf("insufficient credits")
	}
	if balance < item.PriceCredits {
		return nil, fmt.Errorf("insufficient credits")
	}

	// Check ownership
	if item.ItemType == "decoration" {
		var exists bool
		_ = r.pool.QueryRow(ctx, `
			SELECT EXISTS(SELECT 1 FROM user_decorations
			WHERE user_id = $1 AND decoration_id = $2)`, userID, item.ItemID).Scan(&exists)
		if exists {
			return nil, fmt.Errorf("you already own this item")
		}
	} else if item.ItemType == "badge" {
		var exists bool
		_ = r.pool.QueryRow(ctx, `
			SELECT EXISTS(SELECT 1 FROM user_badges
			WHERE user_id = $1 AND badge_id = $2)`, userID, item.ItemID).Scan(&exists)
		if exists {
			return nil, fmt.Errorf("you already own this item")
		}
	} else if item.ItemType == "credit_pack" {
		return nil, fmt.Errorf("credit packs cannot be purchased with credits")
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Deduct credits
	_, err = tx.Exec(ctx, `UPDATE user_credits SET balance = balance - $1, updated_at = NOW() WHERE user_id = $2`,
		item.PriceCredits, userID)
	if err != nil {
		return nil, err
	}

	// Add item to inventory
	if item.ItemType == "decoration" {
		_, err = tx.Exec(ctx, `
			INSERT INTO user_decorations (user_id, decoration_id, is_equipped, acquired_at)
			VALUES ($1, $2, false, NOW())`, userID, item.ItemID)
		if err != nil {
			return nil, err
		}
	} else if item.ItemType == "badge" {
		_, err = tx.Exec(ctx, `
			INSERT INTO user_badges (user_id, badge_id, is_equipped, acquired_at)
			VALUES ($1, $2, false, NOW())`, userID, item.ItemID)
		if err != nil {
			return nil, err
		}
	}

	// Create transaction record
	_, err = tx.Exec(ctx, `
		INSERT INTO transactions (user_id, transaction_type, amount, currency, status, payment_method,
			tx_hash, qris_transaction_id, item_purchased_id, item_name, credit_amount, created_at, updated_at)
		VALUES ($1, 'shop_purchase', $2, 'CREDITS', 'completed', 'credits',
			NULL, NULL, $3, $4, 0, NOW(), NOW())`,
		userID, item.PriceCredits, item.ID, item.Name)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return map[string]any{
		"success": true,
		"message": fmt.Sprintf("Successfully purchased %s", item.Name),
		"item":    item,
	}, nil
}

func findItem(itemID int) *ShopItem {
	for _, item := range defaultShopItems {
		if item.ID == itemID {
			return &item
		}
	}
	return nil
}

func (r *Repository) GetUserTransactions(ctx context.Context, userID int) ([]map[string]any, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, transaction_type, amount, currency, status, payment_method,
		       tx_hash, item_purchased_id, item_name, credit_amount, created_at
		FROM transactions
		WHERE user_id = $1
		ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var txs []map[string]any
	for rows.Next() {
		var id, amount, creditAmount int
		var txType, currency, status, paymentMethod, itemName string
		var txHash, itemPurchasedID interface{}
		var createdAt time.Time
		if err := rows.Scan(&id, &txType, &amount, &currency, &status, &paymentMethod,
			&txHash, &itemPurchasedID, &itemName, &creditAmount, &createdAt); err != nil {
			continue
		}
		txs = append(txs, map[string]any{
			"id": id, "transaction_type": txType, "amount": amount, "currency": currency,
			"status": status, "payment_method": paymentMethod, "tx_hash": txHash,
			"item_purchased_id": itemPurchasedID, "item_name": itemName,
			"credit_amount": creditAmount, "created_at": createdAt,
		})
	}
	return txs, rows.Err()
}
