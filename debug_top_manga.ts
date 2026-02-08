
import { AnalyticsService } from './src/service/analyticsService';

const analyticsService = new AnalyticsService();

console.log('--- Top Manga (Day) ---');
const topDay = analyticsService.getTopManga('day');
console.log(`Count: ${topDay.length}`);
topDay.forEach((m, i) => console.log(`${i + 1}. ${m.title} (${m.views} views)`));

console.log('\n--- Top Manga (Week) ---');
const topWeek = analyticsService.getTopManga('week');
console.log(`Count: ${topWeek.length}`);
topWeek.forEach((m, i) => console.log(`${i + 1}. ${m.title} (${m.views} views)`));

console.log('\n--- Top Manga (Month) ---');
const topMonth = analyticsService.getTopManga('month');
console.log(`Count: ${topMonth.length}`);
topMonth.forEach((m, i) => console.log(`${i + 1}. ${m.title} (${m.views} views)`));
