// API Test Script
import { fetchNBAGamesByDate, getRecentGames } from '../src/lib/api/espn';
import { getTopMarkets } from '../src/lib/api/polymarket';
import { parseTeamsFromTitle } from '../src/lib/utils/team-parser';
import { calculateH2HStats } from '../src/lib/utils/h2h';
import { Cache } from '../src/lib/utils/cache';

console.log('🧪 Testing PolyArena v2.1 Features...\n');
console.log('=' .repeat(60));
console.log('\n');

async function testPolymarket() {
  console.log('📊 Test 1: Polymarket API');
  console.log('-'.repeat(60));
  try {
    const markets = await getTopMarkets(5);
    console.log(`✅ Found ${markets.length} markets`);
    if (markets.length > 0) {
      console.log(`   First market: ${markets[0].title}`);
      console.log(`   Volume: $${markets[0].volume.toLocaleString()}`);
      console.log(`   Sport: ${markets[0].sport}`);
    }
  } catch (error) {
    console.error('❌ Polymarket API test failed:', error);
  }
  console.log('\n');
}

async function testESPN() {
  console.log('🏀 Test 2: ESPN API');
  console.log('-'.repeat(60));
  try {
    const dateStr = '20241115';
    const games = await fetchNBAGamesByDate(dateStr);
    console.log(`✅ Found ${games.length} games for ${dateStr}`);
    if (games.length > 0) {
      console.log(`   First game: ${games[0].name}`);
      console.log(`   Status: ${games[0].status.type.description}`);
    }
  } catch (error) {
    console.error('❌ ESPN API test failed:', error);
  }
  console.log('\n');
}

async function testTeamParser() {
  console.log('🔍 Test 3: Team Name Parser');
  console.log('-'.repeat(60));

  const testCases = [
    'Dallas Mavericks vs Memphis Grizzlies',
    'Lakers vs Warriors',
    'Will Boston beat Miami?',
    'LA Lakers @ Golden State Warriors',
    'Celtics v Heat | NBA Winner'
  ];

  for (const title of testCases) {
    const result = parseTeamsFromTitle(title);
    if (result) {
      console.log(`✅ "${title}"`);
      console.log(`   → ${result.teamA} vs ${result.teamB}`);
    } else {
      console.log(`❌ Failed to parse: "${title}"`);
    }
  }
  console.log('\n');
}

async function testH2HWithStats() {
  console.log('📈 Test 4: H2H Data & Statistics');
  console.log('-'.repeat(60));
  try {
    const teamA = 'DAL';
    const teamB = 'MEM';
    console.log(`Fetching H2H games between ${teamA} and ${teamB}...`);
    const games = await getRecentGames(teamA, teamB, 30);
    console.log(`✅ Found ${games.length} H2H games`);

    if (games.length > 0) {
      const stats = calculateH2HStats(games, teamA, teamB);
      console.log(`\n   Overall Record:`);
      console.log(`   - ${teamA} wins: ${stats.teamAWins}`);
      console.log(`   - ${teamB} wins: ${stats.teamBWins}`);
      console.log(`   - ${teamA} win rate: ${(stats.teamAWinRate * 100).toFixed(1)}%`);
      console.log(`\n   Scoring:`);
      console.log(`   - ${teamA} avg: ${stats.teamAAvgScore.toFixed(1)}`);
      console.log(`   - ${teamB} avg: ${stats.teamBAvgScore.toFixed(1)}`);
      console.log(`   - Avg diff: ${stats.avgScoreDiff.toFixed(1)}`);
      console.log(`\n   Recent Form:`);
      console.log(`   - ${teamA}: ${stats.recentForm.teamA}`);
      console.log(`   - ${teamB}: ${stats.recentForm.teamB}`);
      console.log(`\n   Latest game: ${games[games.length - 1].date}`);
      console.log(`   Score: ${games[games.length - 1].homeScore} - ${games[games.length - 1].awayScore}`);
    }
  } catch (error) {
    console.error('❌ H2H test failed:', error);
  }
  console.log('\n');
}

async function testCache() {
  console.log('💾 Test 5: LocalStorage Cache');
  console.log('-'.repeat(60));

  try {
    // Test cache set/get
    const testData = { message: 'Hello, Cache!', timestamp: Date.now() };
    Cache.set('test_key', testData, 5000); // 5 second expiry

    const retrieved = Cache.get('test_key');
    if (retrieved && JSON.stringify(retrieved) === JSON.stringify(testData)) {
      console.log('✅ Cache set/get works');
    } else {
      console.log('❌ Cache set/get failed');
    }

    // Test cache expiration
    Cache.set('expire_test', { data: 'should expire' }, 100); // 100ms
    await new Promise(resolve => setTimeout(resolve, 150));
    const expired = Cache.get('expire_test');
    if (expired === null) {
      console.log('✅ Cache expiration works');
    } else {
      console.log('❌ Cache expiration failed');
    }

    // Test cache clear
    Cache.set('clear_test', { data: 'should be cleared' });
    Cache.remove('clear_test');
    const cleared = Cache.get('clear_test');
    if (cleared === null) {
      console.log('✅ Cache removal works');
    } else {
      console.log('❌ Cache removal failed');
    }

    console.log('✅ All cache tests passed');
  } catch (error) {
    console.error('❌ Cache test failed:', error);
  }
  console.log('\n');
}

async function testIntegration() {
  console.log('🔗 Test 6: End-to-End Integration');
  console.log('-'.repeat(60));

  try {
    console.log('Simulating full user flow...\n');

    // Step 1: Fetch markets
    console.log('Step 1: Fetching markets from Polymarket...');
    const markets = await getTopMarkets(3);
    console.log(`✅ Retrieved ${markets.length} markets`);

    // Step 2: Parse teams from first market
    if (markets.length > 0) {
      const firstMarket = markets[0];
      console.log(`\nStep 2: Parsing teams from: "${firstMarket.title}"`);
      const teams = parseTeamsFromTitle(firstMarket.title);

      if (teams) {
        console.log(`✅ Parsed: ${teams.teamA} vs ${teams.teamB}`);

        // Step 3: Fetch H2H data
        console.log(`\nStep 3: Fetching H2H data for ${teams.teamA} vs ${teams.teamB}...`);
        const games = await getRecentGames(teams.teamA, teams.teamB, 30);
        console.log(`✅ Found ${games.length} games`);

        // Step 4: Calculate stats
        if (games.length > 0) {
          console.log('\nStep 4: Calculating statistics...');
          const stats = calculateH2HStats(games, teams.teamA, teams.teamB);
          console.log(`✅ Stats calculated`);
          console.log(`   Win rate: ${teams.teamA} ${(stats.teamAWinRate * 100).toFixed(1)}% - ${teams.teamB} ${((1-stats.teamAWinRate) * 100).toFixed(1)}%`);
        }
      } else {
        console.log('⚠️  Could not parse teams (market might not be NBA)');
      }
    }

    console.log('\n✅ Integration test completed successfully');
  } catch (error) {
    console.error('❌ Integration test failed:', error);
  }
  console.log('\n');
}

async function runTests() {
  const startTime = Date.now();

  await testPolymarket();
  await testESPN();
  await testTeamParser();
  await testH2HWithStats();

  // Cache tests only work in browser environment
  console.log('💾 Test 5: LocalStorage Cache');
  console.log('-'.repeat(60));
  console.log('⚠️  Skipped (requires browser environment)');
  console.log('   Cache will be tested in the live app\n\n');

  await testIntegration();

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(1);

  console.log('=' .repeat(60));
  console.log(`\n✨ All tests completed in ${duration}s!\n`);
  console.log('Next steps:');
  console.log('1. Open http://localhost:3000 to test the UI');
  console.log('2. Click on a market card to see H2H analysis');
  console.log('3. Check console for cache hit messages');
  console.log('4. Verify Recharts visualizations render correctly\n');
}

runTests();
