import Redis from 'ioredis';

// 宝塔默认 Redis 端口是 6379
// 如果项目部署在服务器本机，host 填 '127.0.0.1'
const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || '', // 填你宝塔里设置的密码
});

export default redis;