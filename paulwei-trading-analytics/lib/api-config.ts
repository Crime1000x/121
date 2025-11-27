// ============ 服务端 API 配置 ============
// 从环境变量获取 BitMEX API 密钥

export interface ApiConfig {
    apiKey: string;
    apiSecret: string;
    isTestnet: boolean;
    wsUrl: string;
    restUrl: string;
}

// 获取 API 配置
export function getApiConfig(): ApiConfig {
    const apiKey = process.env.BITMEX_API_KEY || '';
    const apiSecret = process.env.BITMEX_API_SECRET || '';
    const isTestnet = process.env.BITMEX_TESTNET === 'true';
    
    return {
        apiKey,
        apiSecret,
        isTestnet,
        wsUrl: isTestnet 
            ? 'wss://ws.testnet.bitmex.com/realtime'
            : 'wss://ws.bitmex.com/realtime',
        restUrl: isTestnet
            ? 'https://testnet.bitmex.com'
            : 'https://www.bitmex.com',
    };
}

// 检查 API 配置是否完整
export function hasValidApiConfig(): boolean {
    const config = getApiConfig();
    return !!(config.apiKey && config.apiSecret);
}

// 获取安全的配置信息（不包含 secret，用于前端显示）
export function getSafeApiInfo(): {
    hasCredentials: boolean;
    isTestnet: boolean;
    keyPrefix: string;
} {
    const config = getApiConfig();
    return {
        hasCredentials: hasValidApiConfig(),
        isTestnet: config.isTestnet,
        keyPrefix: config.apiKey ? config.apiKey.substring(0, 8) + '...' : '',
    };
}
