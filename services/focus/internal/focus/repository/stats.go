package repository

import (
	"context"
	"slices"
	"time"

	focusmodel "github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
)

const focusDateLayout = "2006-01-02"

type dailyAggregate struct {
	Date     time.Time
	Seconds  int
	Sessions int
}

func (r *Repository) GetStats(ctx context.Context, userID string, upTo time.Time) (*focusmodel.Stats, error) {
	upTo = upTo.UTC().Truncate(24 * time.Hour)
	upperExclusive := upTo.AddDate(0, 0, 1)

	activity, err := r.listDailyActivity(ctx, userID, upperExclusive)
	if err != nil {
		return nil, err
	}
	currentStreak, longestStreak := calculateStreaks(activity, upTo)

	from := upTo.AddDate(0, 0, -6)

	return &focusmodel.Stats{
		CurrentStreakDays:   currentStreak,
		LongestStreakDays:   longestStreak,
		TotalFocusedSeconds: totalFocusedSeconds(activity),
		Heatmap:             focusDays(activity),
		LastSevenDays:       padDays(activity, from, upTo),
	}, nil
}

func (r *Repository) listDailyActivity(
	ctx context.Context,
	userID string,
	upperExclusive time.Time,
) ([]dailyAggregate, error) {
	rows, err := r.pg.Query(ctx, `
		SELECT (ended_at AT TIME ZONE 'UTC')::date AS day,
		       COALESCE(SUM(seconds_focused), 0)::int AS seconds,
		       COUNT(*)::int AS sessions
		FROM focus_sessions
		WHERE user_id = $1
		  AND ended_at IS NOT NULL
		  AND ended_at < $2
		  AND seconds_focused > 0
		GROUP BY day
		ORDER BY day
	`, userID, upperExclusive)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]dailyAggregate, 0)
	for rows.Next() {
		var aggregate dailyAggregate
		if err := rows.Scan(&aggregate.Date, &aggregate.Seconds, &aggregate.Sessions); err != nil {
			return nil, err
		}
		aggregate.Date = aggregate.Date.UTC().Truncate(24 * time.Hour)
		out = append(out, aggregate)
	}
	return out, rows.Err()
}

func calculateStreaks(activity []dailyAggregate, upTo time.Time) (current, longest int) {
	upTo = upTo.UTC().Truncate(24 * time.Hour)
	activeDays := make([]time.Time, 0, len(activity))
	for _, aggregate := range activity {
		day := aggregate.Date.UTC().Truncate(24 * time.Hour)
		if !day.After(upTo) {
			activeDays = append(activeDays, day)
		}
	}
	if len(activeDays) == 0 {
		return 0, 0
	}

	slices.SortFunc(activeDays, func(left, right time.Time) int {
		return left.Compare(right)
	})
	activeDays = slices.CompactFunc(activeDays, time.Time.Equal)

	run := 1
	longest = 1
	for index := 1; index < len(activeDays); index++ {
		if activeDays[index-1].AddDate(0, 0, 1).Equal(activeDays[index]) {
			run++
		} else {
			run = 1
		}
		longest = max(longest, run)
	}

	lastActive := activeDays[len(activeDays)-1]
	if lastActive.Equal(upTo) || lastActive.Equal(upTo.AddDate(0, 0, -1)) {
		current = run
	}
	return current, longest
}

func totalFocusedSeconds(activity []dailyAggregate) int {
	total := 0
	for _, aggregate := range activity {
		total += aggregate.Seconds
	}
	return total
}

func focusDays(activity []dailyAggregate) []focusmodel.FocusDay {
	out := make([]focusmodel.FocusDay, 0, len(activity))
	for _, aggregate := range activity {
		out = append(out, focusmodel.FocusDay{
			Date:     aggregate.Date.Format(focusDateLayout),
			Seconds:  aggregate.Seconds,
			Sessions: aggregate.Sessions,
		})
	}
	return out
}

func padDays(activity []dailyAggregate, from, to time.Time) []focusmodel.FocusDay {
	byDate := make(map[string]focusmodel.FocusDay, len(activity))
	for _, aggregate := range activity {
		key := aggregate.Date.Format(focusDateLayout)
		byDate[key] = focusmodel.FocusDay{
			Date:     key,
			Seconds:  aggregate.Seconds,
			Sessions: aggregate.Sessions,
		}
	}
	out := make([]focusmodel.FocusDay, 0, 7)
	for day := from; !day.After(to); day = day.AddDate(0, 0, 1) {
		key := day.Format(focusDateLayout)
		if aggregate, ok := byDate[key]; ok {
			out = append(out, aggregate)
		} else {
			out = append(out, focusmodel.FocusDay{Date: key})
		}
	}
	return out
}
