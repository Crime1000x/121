// 测试修复后的数据解析
const fetch = require('node-fetch');

async function testFixes() {
  console.log('🧪 测试修复后的功能\n');
  console.log('=' .repeat(50));

  try {
    // 获取 NBA 市场数据
    const response = await fetch('http://localhost:3004/api/polymarket?tag=NBA&limit=3');
    const data = await response.json();

    console.log(`\n✅ 获取到 ${data.length} 个市场\n`);

    for (let i = 0; i < Math.min(3, data.length); i++) {
      const event = data[i];
      const market = event.markets[0];

      console.log(`\n市场 ${i + 1}:`);
      console.log('-' .repeat(50));
      console.log(`标题: ${event.title.substring(0, 80)}...`);
      console.log(`运动: ${event.series[0].title}`);

      // 测试 outcomePrices 解析
      let outcomePrices = '[未解析]';
      if (typeof market.outcomePrices === 'string') {
        const parsed = JSON.parse(market.outcomePrices);
        const prices = parsed.map(p => parseFloat(p));
        outcomePrices = `[${prices[0].toFixed(6)}, ${prices[1].toFixed(6)}]`;

        console.log(`\n📊 价格数据:`);
        console.log(`  原始: ${market.outcomePrices.substring(0, 50)}...`);
        console.log(`  解析后: ${outcomePrices}`);
        console.log(`  Yes: ${(prices[0] * 100).toFixed(1)}%`);
        console.log(`  No: ${(prices[1] * 100).toFixed(1)}%`);
      }

      // 测试队伍名称解析
      console.log(`\n🏀 队伍解析测试:`);
      const title = event.title;

      // 使用修复后的正则
      const beatMatch = title.match(/Will\s+(?:the\s+)?(.+?)\s+beat\s+(?:the\s+)?(.+?)\s+by\s+/i);
      if (beatMatch) {
        console.log(`  ✅ 成功解析!`);
        console.log(`  队伍 A: ${beatMatch[1].trim()}`);
        console.log(`  队伍 B: ${beatMatch[2].trim()}`);
      } else {
        console.log(`  ❌ 无法解析队伍名称`);
      }
    }

    console.log('\n' + '=' .repeat(50));
    console.log('\n✅ 所有测试完成！\n');
    console.log('现在可以在浏览器中验证:');
    console.log('1. 打开 http://localhost:3004');
    console.log('2. 清除缓存: localStorage.clear()');
    console.log('3. 刷新页面');
    console.log('4. 检查 Yes/No 价格是否正常显示');
    console.log('5. 点击市场卡片，检查详情页是否正常\n');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    process.exit(1);
  }
}

testFixes();
