/**
 * 统一日志工具
 * 提供标准化的日志输出格式
 */

type LogLevel = 'success' | 'error' | 'warn' | 'info' | 'debug';

interface LogEntry {
  level: LogLevel;
  message: string;
  data?: any;
  timestamp: string;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';
  
  /**
   * 格式化日志条目
   */
  private formatLog(level: LogLevel, message: string, data?: any): LogEntry {
    return {
      level,
      message,
      data,
      timestamp: new Date().toISOString(),
    };
  }
  
  /**
   * 获取 emoji 前缀
   */
  private getEmoji(level: LogLevel): string {
    const emojiMap: Record<LogLevel, string> = {
      success: '✅',
      error: '❌',
      warn: '⚠️',
      info: 'ℹ️',
      debug: '🔍',
    };
    return emojiMap[level];
  }
  
  /**
   * 核心日志方法
   */
  private log(level: LogLevel, message: string, data?: any): void {
    const emoji = this.getEmoji(level);
    const prefix = `${emoji} [${level.toUpperCase()}]`;
    
    if (data !== undefined) {
      console.log(`${prefix} ${message}`, data);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }
  
  /**
   * 成功日志
   */
  success(message: string, data?: any): void {
    this.log('success', message, data);
  }
  
  /**
   * 错误日志
   */
  error(message: string, error?: any): void {
    this.log('error', message, error);
  }
  
  /**
   * 警告日志
   */
  warn(message: string, data?: any): void {
    this.log('warn', message, data);
  }
  
  /**
   * 信息日志
   */
  info(message: string, data?: any): void {
    this.log('info', message, data);
  }
  
  /**
   * 调试日志（仅开发环境）
   */
  debug(message: string, data?: any): void {
    if (this.isDevelopment) {
      this.log('debug', message, data);
    }
  }
  
  /**
   * 性能计时开始
   */
  timeStart(label: string): void {
    if (this.isDevelopment) {
      console.time(`⏱️ ${label}`);
    }
  }
  
  /**
   * 性能计时结束
   */
  timeEnd(label: string): void {
    if (this.isDevelopment) {
      console.timeEnd(`⏱️ ${label}`);
    }
  }
}

// 导出单例
export const logger = new Logger();